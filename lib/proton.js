
var promise = require('promised-io/promise'),
    net     = require('net'),
    http    = require('http'),
    daemon  = require('daemon');

/* 
Removed until we have tests

function extractStack (stack) {
    var frames = stack.split(/\n\s* /); // need to remove the space in this - added to stop spurious comment ending
    frames.shift(); // message
    return frames.map(function (frame) {
        var match = frame.match(/^at (.+) \((.+?):(\d+):(\d+)\)$/) || frame.match(/^at ()(.+?):(\d+):(\d+)$/) || frame.match(/^at (.+) (\(native\))$/);
        if (! match) {
            throw new Error('proton: could not extract data from stack frame: ' + frame);
        }
        return {
            'func' : match[1],
            'file' : match[2],
            'line' : match[3],
            'char' : match[4]
        };
    });
}

function formatStack (stack) {
    var result = 'Stack trace:\n';

    for (var i = 0, ilen = stack.length; i < ilen; i++) {
        var frame = stack[i];
        result += '    ' + frame.file + ' line ' + frame.line + ', char ' + frame.char + ' (' + frame.func + ')\n';
    }

    return result;
}

function decorateError (run, handler, invocant) {
    return function () {
        try {
            return run.apply(this, arguments);
        }
        catch (e) {
            var message = exports.errorMessage(e);
            e.toString = function () {
                return message;
            };
            if (handler) {
                handler.call(invocant, e);
            }
            else {
                throw e;
            }
        }
    };
};

exports.errorMessage = function (e) {
     var stack = extractStack(e.stack);
     return e + '\n' +
            '    at ' + stack[0].file + ' line ' + stack[0].line + ', char ' + stack[0].char + '\n' + 
            '    (' + stack[0].func + ')\n' +
            '\n' + formatStack(stack);
};




exports.beforeStart = function (WebApp, beforeStart) {
    if (! WebApp._protonBeforeStart) {
        WebApp._protonBeforeStart = [];
    }
    WebApp._protonBeforeStart.push(beforeStart);
};


exports.runReload = function (options, nodePath, args, env, cwd) {
    var child = null,
        timeout;

    var server = net.createServer(function (connection) {
        connection.pause();

        if (! child || child.connections++ < 6) {
            child = new utils.Child(nodePath, args, env, cwd);
        }
        clearTimeout(timeout);
        timeout = setTimeout(function () {
            child = null;
        }, 2000);
        child.send(connection);
    });
    server.listen(options.port || 80, options.bindTo);
    return (options.bindTo || '0.0.0.0') + ':' + (options.port || 80);
};

exports.runSingleConnection = function (WebApp, options, onError) {
    var stdin       = new net.Stream(0, 'unix'),
        connections = 0;
    stdin.addListener('fd', function (fd) {
        connections++;
        var socket = new net.Socket({
                fd            : fd,
                type          : 'tcp4',
                allowHalfOpen : true
            }),
            webapp  = new WebApp(),
            timeout,
            server = http.createServer(new jsgi.Listener(function (request) {
                if (timeout) {
                   clearTimeout(timeout);
                   delete timeout;
                }
                var done = webapp.handle(request);
                done.then(function () {
                    setTimeout(function () {
                        socket.end();
                    }, 2000);
                });
                return done;
            }));
        webapp.protonServer = server;
        socket.on('close', function () {
            if (--connections === 0) {
                process.exit(0);
            }
        });
        socket.readable = socket.writable = true;
        prepare(WebApp).then(function () {
            server.emit('connection', socket);
            socket.resume();
        });
    });
    stdin.resume();
};
*/

var Server = exports.Server = function (WebApp, options) {
    if (! WebApp || typeof(WebApp) !== 'function') {
        throw new Error('WebApp parameter to new proton.Server not set or not function');
    }
    if (! options) {
        options = {};
    }
    if (options.daemonise && options.pidfile) {
        if (! options.pidfile) {
            throw new Error('pidfile required when daemonise is true');
        }
        if (! options.logdir) {
            throw new Error('logdir required when daemonise is true');
        }
    }
    this._WebApp    = WebApp;
    this._bindTo    = options.bindTo || '0.0.0.0';
    this._port      = options.port || 80;
    this._daemonise = options.daemonise;
    this._pidfile   = options.pidfile;
    this._uid       = options.uid;
    this._gid       = options.gid;
    this._logdir    = options.logdir;
};

Server.prototype.start = function () {
    var started    = new promise.Promise,
        webapp     = new this._WebApp,
        server     = this,
        httpServer = server._httpServer = server.httpModule().createServer(function (request, response) {
            webapp.handle(request, response);
        }),
        start = function () {
            httpServer.listen(server._port, server._bindTo, function () {
                started.resolve(server._bindTo + ':' + server._port);
            });
        };
    var daemonised = new promise.Promise;
    if (this._daemonise) {
        this.daemonModule().daemonize({
            stdout: this._logdir + '/log',
            stderr: this._logdir + '/errors'
        }, this._pidfile, function (err, pid) {
            if (err) {
                throw new Error('error starting daemon: ' + err);
            }
            daemonised.resolve();
        });
    }
    else {
        daemonised.resolve();
    }
    if (webapp.onBeforeStart) {
        daemonised.then(function () {
            webapp.onBeforeStart().then(start);
        });
    }
    else {
        daemonised.then(start);
    }
    return started;
};

Server.prototype.stop = function () {
    this._httpServer.close();
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


