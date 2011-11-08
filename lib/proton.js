
var promise       = require('promised-io/promise'),
    net           = require('net'),
    http          = require('http'),
    daemon        = require('daemon'),
    os            = require('os'),
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
    if (options.reload && options.processes) {
        throw new Error('cannot use multiple processes when reload option is specified');
    }
    if (options.single && options.processes) {
        throw new Error('cannot use multiple processes when single option is specified');
    }
    if (options.single && options.reload) {
        throw new Error('cannot use single process option when reload option is specified');
    }
    //if (options.reload
    this._webappPath = webappPath;
    this._bindTo     = options.bindTo || '0.0.0.0';
    this._port       = options.port || 80;
    this._daemonise  = options.daemonise;
    this._pidfile    = options.pidfile;
    this._uid        = options.uid;
    this._gid        = options.gid;
    this._logdir     = options.logdir;
    this._reload     = options.reload;
    this._single     = options.single;
    if (! options.single && ! options.reload) {
        this._processes  = options.processes || os.cpus().length;
    }
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

Server.prototype._doDaemonise = function () {
    var ready = new promise.Promise();

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

    return ready;
};

Server.prototype.start = function () {

    var started = new promise.Promise,
        server = this;

    if (this._reload) {
        this._runReload(started);
        return started;
    }
        
    if (this._single) {
        this._runSingle(started);
    }
    else {
        this._doDaemonise().then(function () {
            server._runMultiple(started);
        });
    }

    return started;
};

Server.prototype._spawn = function (i) {
    var child = this._children[i] = child_process.fork(__dirname + '/multiple.js'),
        started = (new Date).getTime(),
        done = new promise.Promise(),
        server = this;

    child.on('exit', this._childrenExitListeners[i] = function () {
        server._runningChildren--;
        var ended = (new Date).getTime();
        // don't try to restart too quickly if it exits immediately
        if (ended - started < 1000) {
            console.error('child died (after ' + (ended - started) + 'ms), restarting after a second');
            setTimeout(function () {
                server._spawn(i);
            }, 1000);
        }
        else {
            server._spawn(i);
        }
    });

    child.on('message', function () {
        server._runningChildren++;
        done.resolve();
    });

    child.send(this._webappPath);
    child.send('x', this._server._handle);

    return done;
};

Server.prototype._runMultiple = function (started) {
    var server = this;
    this._server = net.createServer();
    this._children = [];
    this._runningChildren = 0;
    this._childrenExitListeners = [];

    this._server.listen(server._port, server._bindTo, function () {

        var running = [];

        for (var i = 0; i < server._processes; i++) {
            running[i] = server._spawn(i);
        }

        server._onStop = function () {
            for (var i = 0, l = this._children.length; i < l; i++) {
                server._children[i].removeListener('exit', server._childrenExitListeners[i]);
                server._children[i].kill();
            }
            server._server.close();
        };

        promise.first(running).then(function () {
            started.resolve(server._bindTo + ':' + server._port);
        });
    });
};

Server.prototype._runSingle = function (started) {
    var webapp     = this.webapp = new (require(this._webappPath)),
        server     = this,
        httpServer = this._server = this.httpModule().createServer(function (request, response) {
            webapp.handle(request, response);
        });

    this._doDaemonise().then(function () {

        var ready = new promise.Promise;

        if (webapp.onBeforeStart) {
            webapp.onBeforeStart(ready);
        }
        else {
            ready.resolve();
        }

        return ready;

    }).then(function () {
        httpServer.listen(server._port, server._bindTo, function () {

            server._onStop = function () {
                server._server.stop();
            };

            started.resolve(server._bindTo + ':' + server._port);
        });
    });
};

Server.prototype.stop = function () {
    if (this._onStop) {
        this._onStop();
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
    
    function onExit () {
        server._child = null;
        if (connections.length) {
            createChild();
        }
    }

    server._onStop = function () {
        if (this._child) {
            this._child.removeListener('exit', onExit);
            this._child.kill();
        }
        this._server.close();
    };
    
    var netServer = this._server = net.createServer(function (connection) {
        connection.pause();

        if (! server._child) {
            createChild();

            server._child.on('exit', onExit);;

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


