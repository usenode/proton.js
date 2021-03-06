
var promise = require('promised-io/promise'),
    fs      = require('fs'),
    net     = require('net'),
    http    = require('http'),
    cluster = require('cluster'),
    stdin,
    stdout,
    stderr;

/**
 * Utility to allow classical-style inheritance.
 */
function extend (Subclass, Superclass) {
    var StandinSuperclass = function () {};
    StandinSuperclass.prototype = Superclass.prototype;
    Subclass.prototype = new StandinSuperclass;
}

/**
 * Abstract base class for proton servers.
 */
var Server = function (options) {
    this._options = options;
};

/**
 * Load the webapp specified in the server options and runs its onBeforeStart
 * hook (if present). Returns a promise that is resolved with the webapp when
 * it is ready.
 */
Server.prototype._createWebapp = function () {
    var ready = new promise.Promise();

    var webapp = new (require(this._options.webapp))(process.cwd());
    if (webapp.onBeforeStart) {
        promise.when(webapp.onBeforeStart(), function () {
            ready.resolve(webapp);
        });
    }
    else {
        ready.resolve(webapp);
    }

    return ready;
};

/**
 * Takes a webapp and initialises an http server that sends requests to that
 * webapp. This server is saved in the _httpServer property on the server.
 */
Server.prototype._createHttpServer = function (webapp) {
    this._httpServer =  http.createServer(function (request, response) {
        webapp.handle(request, response);
    });
};

/**
 * Returns the address that the server is bound to in order to display to the
 * user when the server has started.
 */
Server.prototype._boundTo = function () {
    return (this._options.bindTo || '0.0.0.0') + ':' + this._options.port;
};

/**
 * This class implements a server that spawns a new child process for new
 * connections, thereby ensuring a fresh copy of the code is loaded each
 * time. Connections that are received while requests received on the
 * original connection (before a short inactivity timeout on the connection),
 * are passed to the same child process for speed.
 */
var ReloadingServer = exports.ReloadingServer = function () {
    Server.apply(this, arguments);
};
extend(ReloadingServer, Server);

/**
 * Run the server.
 */
ReloadingServer.prototype.run = function (started) {
    var started = new promise.Promise;

    this._connections = [];

    this._createServer();

    var listenErrorCallback = function (e) {
        started.reject(e);
    }; 
    this._server.on('error', listenErrorCallback);

    this._server.listen(this._options.port, this._options.bindTo, function (err) {
        this._server.removeListener('error', listenErrorCallback);
        if (err) {
            started.reject(err);
        }
        else {
            started.resolve(this._boundTo());
        }
    }.bind(this));
    
    return started;
};

/**
 * Stop the server.
 */
ReloadingServer.prototype.stop = function () {
    var stopped = new promise.Promise,
        childRunning = false,
        serverClosed = true;
    if (this._childReady) {
        childRunning = true;
        this._childReady.then(function (child) {
            child.on('exit', function () {
                childRunning = false;
                if (! serverRunning) {
                    stopped.resolve();
                }
            });
            child.kill('SIGQUIT');
        });
    }
    this._server.close(function () {
        serverRunning = false;
        if (! childRunning) {
            stopped.resolve();
        }
    });
    return stopped;
};

/**
 * Ignore a request to gracefully reload with a warning.
 */
ReloadingServer.prototype.gracefulReload = function () {
    console.warn('SIGUSR1 ignored in reloading server - already reloading');
};

/**
 * Create a net.Server object to listen for connections and store in the _server property.
 */
ReloadingServer.prototype._createServer = function () {
    this._server = net.createServer(function (connection) {
        connection.pause();
        this._connections.push(connection);
        this._handleConnections();
    }.bind(this));
};

/**
 * Spawns a child (if necessary) and passes any received connections to it.
 */
ReloadingServer.prototype._handleConnections = function () {
    this._getChild().then(function (child) {
        for (var i = 0, l = this._connections.length; i < l; i++) {
            child.send('x', this._connections[i]._handle);
        }
    }.bind(this));
};

/**
 * Spawns a child. Returns a promise that is resolved with the child when it has signalled
 * that it is ready.
 */
ReloadingServer.prototype._getChild = function () {
    if (this._childReady) {
        return this._childReady;
    }
    this._childReady = new promise.Promise();

    var child = cluster.fork(),
        first = true;

    child.on('exit', this._onChildExit.bind(this));

    child.on('message', function (m) {
        if (first) {
            this._childReady.resolve(child);
            first = false;
        }
        else {
            if (this._connections.length > 0) {
                this._connections.shift().destroy();
            }
        }
    }.bind(this));

    return this._childReady;
};

/**
 * Callback invoked when a child exits to remove the reference to the child, stopping
 * connections being sent to it. Also initiates remaining connections being handled
 * (i.e. by a new child) if any remain.
 */
ReloadingServer.prototype._onChildExit = function () {
    this._childReady = null;
    if (this._connections.length) {
        this._handleConnections();
    }
};

/**
 * This class implements the child process for the ReloadingServer.
 */
var ReloadingChildServer = exports.ReloadingChildServer = function () {
    Server.apply(this, arguments);
};
extend(ReloadingChildServer, Server);

/**
 * Run the reloading child server.
 */
ReloadingChildServer.prototype.run = function () {
    var started = new promise.Promise;

    this._createWebapp().then(function (webapp) {

        this._connectionCount = 0;
        this._createHttpServer(webapp);

        process.on('message', this._handleConnectionMessage.bind(this));
        // confirm we're ready to start receiving connections
        process.send('');
        
        this._startInactivityTimeout();

        started.resolve(this._boundTo());

    }.bind(this));

    return started;
};

/**
 *
 */
ReloadingChildServer.prototype.stop = function () {
    var stopped = new promise.Promise;
    this._httpServer.close(function () {
        stopped.resolve;
    });
    return stopped;
};

/**
 * Ignore a request to gracefully reload with a warning.
 */
ReloadingChildServer.prototype.gracefulReload = function () {
    console.warn('SIGUSR1 ignored in reloading server child - already reloading');
};

/**
 * Takes a webapp and initialises an http server that sends requests to that
 * webapp. This server is saved in the _httpServer property on the server.
 * Overridden to hook into the server response, setting the inactivity timeout
 * once the response has ended.
 */
ReloadingChildServer.prototype._createHttpServer = function (webapp) {
    var server = this;
    this._httpServer =  http.createServer(function (request, response) {
        // TODO: there is a 'finish' event node emits on the ServerResponse, but is
        // undocumented API - submit a documentation patch and use that API
        var originalEnd = response.end;
        response.end = function () {
            server._startInactivityTimeout();
            return originalEnd.apply(response, arguments);
        };
        webapp.handle(request, response);
    });
};

/**
 * This callback is invoked in the child when the parent process sends the child
 * a connection. The connection handle parameter is wrapped in a net.Socket and
 * emitted as a connection event within the http server, before being resumed.
 */
ReloadingChildServer.prototype._handleConnectionMessage = function (message, handle) {
    this._connectionCount++;

    this._cancelInactivityTimeout();

    // confirm receipt of the connection
    process.send('');

    var connection = new net.Socket({
        handle        : handle,
        type          : 'tcp4',
        allowHalfOpen : false // right?
    });

    connection.readable = connection.writable = true;

    connection.on('close', function () {
        if (--(this._connectionCount) === 0) {
            this._startInactivityTimeout();
        }
    });

    this._httpServer.emit('connection', connection);
    connection.resume();
};

/**
 * Begins the inactivity timeout in the child.
 */
ReloadingChildServer.prototype._startInactivityTimeout = function () {
    this._cancelInactivityTimeout();
    this._inactivityTimeout = setTimeout(function () {
        process.exit(0);
    }, 2000);
};

/**
 * Removes an existing inactivity timeout in the child.
 */
ReloadingChildServer.prototype._cancelInactivityTimeout = function () {
    if (this._inactivityTimeout) {
        clearTimeout(this._inactivityTimeout);
    }
};

/**
 * This class implements a single process server for debugging purposes.
 */
var SingleProcessServer = exports.SingleProcessServer = function () {
    Server.apply(this, arguments);
};
extend(SingleProcessServer, Server);

/**
 * Run the single process server.
 */
SingleProcessServer.prototype.run = function () {
    var started = new promise.Promise;

    this._createWebapp().then(function (webapp) {
        
        this._createHttpServer(webapp);

        var port = parseInt(this._options.port, 10);
        var address = this._options.bindTo;
        this._httpServer.listen(port, this._options.bindTo, function (arg) {
            if (cluster.isWorker) {
                process.send({ success: true });
            }
            started.resolve(this._boundTo());
        }.bind(this));

    }.bind(this));

    return started;
};

/**
 * If we're the main process ignore with a warning, otherwise stop accepting connections and wait
 * for the number of connections to reach zero and exit.
 */
SingleProcessServer.prototype.gracefulReload = function () {
    if (cluster.isMaster) {
        console.warn('SIGUSR1 ignored - graceful reloading not supported with nofork option');
    }
    else {
        this._httpServer.close(function () {
            process.exit(0);
        });
    }
};

/**
 * Stop the server.
 */
SingleProcessServer.prototype.stop = function () {
    var stopped = new promise.Promise;
    if (this._httpServer) {
        this._httpServer.close(function () {
            stopped.resolve();
        });
    }
    else {
        stopped.resolve();
    }
    return stopped;
};

/**
 * This class implements a preforking server that starts as many worker processes as
 * there are cpu cores. This is recommended for production use.
 */
var MultipleProcessServer = exports.MultipleProcessServer = function () {
    Server.apply(this, arguments);
};
extend(MultipleProcessServer, Server);

/**
 * Run the multiple process server, spawning as many workers as there are
 * configured processes.
 */
MultipleProcessServer.prototype.run = function () {
    this._workers = [];

    var started = new promise.Promise;

    // TODO: re-enable if we find a way to set stdout and stderr for the spawned worker processes
    // this._initialiseLogHandles();

    this._createHttpServer({
        'handle' : function () {
            throw new Error('request received in supervisor process!');
        }
    });

    var workersStarted = [];
    for (var i = 0; i < this._options.processes; i++) {
        workersStarted.push(this._spawnWorker(i));
    }

    promise.first(workersStarted).then(
        function () {
            started.resolve(this._boundTo());
        }.bind(this),
        function (message) {
            started.reject(message);
        }
    );

    return started;

};

/**
 * Opens up write handles for logging to pass to each worker process.
 * TODO: while we can open the log handles, we can't set them as stdout and stderr
 *       for spawned processes yet
 */
MultipleProcessServer.prototype._initialiseLogHandles = function () {
    if (! this._options.logdir) {
        return;
    }
    this._closeLogHandles();
    this._stdout = fs.openSync(this._options.logdir + os.directorySeprator + 'log', 'a');
    this._stderr = fs.openSync(this._options.logdir + os.directorySeprator + 'errors', 'a');
};

/**
 * Closes any logging filehandles.
 */
MultipleProcessServer.prototype._closeLogHandles = function () {
    if (this._stdout) {
        fs.closeSync(this._stdout);
    }
    if (this._stderr) {
        fs.closeSync(this._stderr);
    }
};

/**
 * Signal each of the worker processes to gracefully shutdown, resulting in them being recreated.
 */
MultipleProcessServer.prototype.gracefulReload = function () {
    // TODO: this is where we would reopen the logfiles for new workers to use if we could
    //       find a way to set stdout and stderr for spawned workers
    // this._initialiseLogHandles();
    for (var i = 0, l = this._workers.length; i < l; i++) {
        this._workers[i].process.kill('SIGUSR1');
    }
};

/**
 * Stop the sever by killing each of the worker processes.
 */
MultipleProcessServer.prototype.stop = function () {
    var stopped = new promise.Promise;
    this._stopping = true;
    var died = 0;
    for (var i = 0, l = this._workers.length; i < l; i++) {
        this._workers[i].process.kill('SIGQUIT');
        this._workers[i].on('exit', function () {
            if (++died == l) {
                stopped.resolve();
            }
        }.bind(this));
    }
    // TODO: enable if log functionality is enabled
    // this._closeLogHandles();
    return stopped;
};

/**
 * Creates a worker process, as well as events to recreate it if it dies. Takes
 * an index that uniquely identifies the worker.
 */
MultipleProcessServer.prototype._spawnWorker = function (i) {
    var success = new promise.Promise;
        started = (new Date).getTime(),
        worker  = this._workers[i] = cluster.fork();

    worker.on('message', function (status) {
        if (status.success) {
            success.resolve();
        }
        else {
            success.reject(status.message);
        }
    });

    worker.on('exit', function () {
        if (this._stopping) {
            return;
        }
        var diedAfter = (new Date).getTime() - started;
        if (diedAfter < 2000) {
            console.error('worker died after ' + diedAfter + 'ms, restarting in a second...');
            setTimeout(this._spawnWorker.bind(this, i), 1000);
        }
        else {
            process.nextTick(this._spawnWorker.bind(this, i));
        }
    }.bind(this));

    return success;
};

