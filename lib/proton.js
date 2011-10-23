
var promise       = require('promised-io/promise'),
    net           = require('net'),
    http          = require('http'),
    daemon        = require('daemon'),
    child_process = require('child_process');

var Server = exports.Server = function (webappPath, options) {
    if (! webappPath) {
        throw new Error('webappPath parameter to new proton.Server not set');
    }
    if (! options) {
        options = {};
    }
    if (options.daemonise) {
        if (options.reload) {
            throw new Error('cannot automatically reload when daemonise is true');
        }
        if (! options.pidfile) {
            throw new Error('pidfile required when daemonise is true');
        }
        if (! options.logdir) {
            throw new Error('logdir required when daemonise is true');
        }
    }
    this._webappPath = webappPath;
    this._bindTo     = options.bindTo || '0.0.0.0';
    this._port       = options.port || 80;
    this._daemonise  = options.daemonise;
    this._pidfile    = options.pidfile;
    this._uid        = options.uid;
    this._gid        = options.gid;
    this._logdir     = options.logdir;
    this._reload     = options.reload;
};

Server.prototype.httpModule = function () {
    return this._httpModule || http;
};

Server.prototype.setHttpModule = function (httpModule) {
    this._httpModule = httpModule;
};

Server.prototype.daemonModule = function () {
    return this._daemonModule || daemon;
};

Server.prototype.setDaemonModule = function (daemonModule) {
    this._daemonModule = daemonModule;
};

Server.prototype.start = function () {

    var started = new promise.Promise;

    if (this._reload) {
        this._runReload(started);
        return started;
    }

    var webapp     = this.webapp = new (require(this._webappPath)),
        server     = this,
        httpServer = server._server = server.httpModule().createServer(function (request, response) {
            webapp.handle(request, response);
        }),
        ready = new promise.Promise;

    if (this._daemonise) {
        this.daemonModule().daemonize({
            stdout: this._logdir + '/log',
            stderr: this._logdir + '/errors'
        }, this._pidfile, function (err, pid) {
            if (err) {
                throw new Error('error starting daemon: ' + err);
            }
            ready.resolve();
        });
    }
    else {
        ready.resolve();
    }

    ready.then(function () {
        var ready = new promise.Promise;
        if (webapp.onBeforeStart) {
            webapp.onBeforeStart(ready);
        }
        else {
            ready.resolve();
        }
        ready.then(function () {
            httpServer.listen(server._port, server._bindTo, function () {
                started.resolve(server._bindTo + ':' + server._port);
            });
        });
    });

    return started;
};

Server.prototype.stop = function () {
    this._server.close();
    if (this._child) {
        this._child.kill();
    }
};

Server.prototype._runReload = function (started) {
    var server = this,
        connections = [];

    function createChild () {
        server._child = child_process.fork(__dirname + '/reload.js');
        server._child.send(server._webappPath);
        for (var i = 0, l = connections.length; i < l; i++) {
            server._child.send('x', connections[i]._handle);
        }
    }

    var netServer = this._server = net.createServer(function (connection) {
        connection.pause();

        if (! server._child) {
            createChild();

            server._child.on('exit', function () {
                server._child = null;
                if (connections.length) {
                    createChild();
                }
            });

            server._child.on('message', function (m) {
                connections.shift().destroy();
            });
        }

        connections.push(connection);

        server._child.send('x', connection._handle);
    });

    netServer.listen(this._port, this._bindTo, function () {
        started.resolve(server._bindTo + ':' + server._port);
    });
};


