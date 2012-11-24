
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

    var webapp = new (require(this._options.webapp))();
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
 * Daemonise the server - this functionality is currently disabled due to the
 * daemon module be deprecated for node 0.8.x and later. This functionality
 * will be replaced with something based on child_process.spawn with the
 * detached option set.
 */
Server.prototype.daemonise = function (pidfile, uid, gid, logdir) {
    throw new Error('daemonise option not currently supported');
    /*
    var pid = daemon.start();
    daemon.lock(this._options.pidfile);
    if (this._options.uid && this._options.gid) {
        process.setgid(this._options.gid);
        process.setuid(this._options.uid);
    }
    daemon.closeIO();
    // these work because they are in the right order after closeIO
    stdin  = fs.openSync('/dev/null', 'r');
    if (this._options.logdir) {
        stdout = fs.openSync(this._options.logdir + '/log', 'a');
        stderr = fs.openSync(this._options.logdir + '/errors', 'a');
    }
    else {
        stdout = fs.openSync('/dev/null', 'a');
        stderr = fs.openSync('/dev/null', 'a');
    }
    process.umask(027);
    process.chdir('/');
    */
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
    if (this._childReady) {
        this._childReady.then(function (child) {
            child.kill();
        });
    }
    this._server.close();
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
            this._connections.shift().destroy();
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

    if (this._options.daemonise) {
        this.daemonise();
    }

    this._createWebapp().then(function (webapp) {
        
        this._createHttpServer(webapp);

        this._httpServer.listen(this._options.port, this._options.bindTo, function () {
            started.resolve(this._boundTo());
        }.bind(this));

    }.bind(this));

    return started;
};

/**
 * Stop the server.
 */
SingleProcessServer.prototype.stop = function () {
    if (this._httpServer) {
        this._httpServer.close();
    }
};

/**
 * This class implements a preforking server that starts as many child processes as
 * there are cpu cores. This is recommended for production use.
 */
var MultipleProcessServer = exports.MultipleProcessServer = function () {
    Server.apply(this, arguments);
};
extend(MultipleProcessServer, Server);




