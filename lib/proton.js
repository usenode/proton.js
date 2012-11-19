
var promise = require('promised-io/promise'),
    fs      = require('fs'),
    net     = require('net'),
    http    = require('http'),
    cluster = require('cluster'),
    stdin,
    stdout,
    stderr;

var Server = exports.Server = function (options) {
    this._options = options;
};

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

Server.prototype._handleConnectionMessageInReloadingChild = function (message, handle) {
    this._connectionCount++;

    this._cancelReloadingChildCountdown();

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
            this._startReloadingChildCountdown();
        }
    });

    this._httpServer.emit('connection', connection);
    connection.resume();
};

Server.prototype._startReloadingChildCountdown = function () {
    this._cancelReloadingChildCountdown();
    this._reloadingChildCountdown = setTimeout(function () {
        process.exit(0);
    }, 2000);
};

Server.prototype._cancelReloadingChildCountdown = function () {
    if (this._reloadingChildCountdown) {
        clearTimeout(this._reloadingChildCountdown);
    }
};

Server.prototype._runReloadingChild = function () {

    this._createWebapp().then(function (webapp) {

        this._connectionCount = 0;
        this._createHttpServer(webapp);

        process.on('message', this._handleConnectionMessageInReloadingChild.bind(this));
        // confirm we're ready to start receiving connections
        process.send('');
        
        this._startReloadingChildCountdown();

    }.bind(this));

};

Server.prototype._getReloadingChild = function () {
    if (this._childReady) {
        return this._childReady;
    }
    this._childReady = new promise.Promise();

    var child = cluster.fork(),
        first = true;

    child.on('exit', this._onReloadingChildExit.bind(this));

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

Server.prototype._onReloadingChildExit = function () {
    this._childReady = null;
    if (this._connections.length) {
        this._handleReloadingConnections();
    }
};

Server.prototype._handleReloadingConnections = function () {
    this._getReloadingChild().then(function (child) {
        for (var i = 0, l = this._connections.length; i < l; i++) {
            child.send('x', this._connections[i]._handle);
        }
    }.bind(this));
};

Server.prototype._createReloadingServer = function () {
    this._reloadingServer = net.createServer(function (connection) {
        connection.pause();
        this._connections.push(connection);
        this._handleReloadingConnections();
    }.bind(this));
};

Server.prototype._runReloading = function (started) {
    if (cluster.isWorker) {
        return this._runReloadingChild();
    }

    this._connections = [];

    // TODO
    /*server._onStop = function () {
        if (this._child) {
            this._child.removeListener('exit', onExit);
            this._child.kill();
        }
        this._server.close();
    };
    */
    
    this._createReloadingServer();

    this._reloadingServer.on('error', function (e) {
        started.reject(e);
    });

    this._reloadingServer.listen(this._options.port, this._options.bindTo, function (err) {
        if (err) {
            started.reject(err);
        }
        else {
            started.resolve(this._boundTo());
        }
    }.bind(this));
};

Server.prototype._createWebapp = function () {
    if (this._webappLoaded) {
        return this._webappLoaded;
    }
    var ready = this._webappLoaded = new promise.Promise();

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

Server.prototype._createHttpServer = function (webapp) {
    this._httpServer =  http.createServer(function (request, response) {
        webapp.handle(request, response);
    });
};

Server.prototype.run = function () {
    var started = new promise.Promise;
    if (this._options.reload) {
        this._runReloading(started);
        return started;
    }

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

Server.prototype._boundTo = function () {
    return (this._options.bindTo || '0.0.0.0') + ':' + this._options.port;
};

