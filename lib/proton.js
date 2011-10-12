
var promise     = require('promised-io/lib/promise'),
    daemon      = require('./daemon');
    net         = require('net'),
    net_binding = process.binding('net'),
    http        = require('http'),
    spawn       = require('child_process').spawn;

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

var Child = function (nodePath, args, env, cwd) {
    var pipe    = net_binding.socketpair(),
        process = spawn(nodePath, args, {
            customFds : [pipe[1], -1, -1],
            env       : env,
            cwd       : cwd
        });

    this.input = new net.Stream(pipe[0], 'unix');

    process.stdout.on('data', function (data) {
        process.stdout.write(data);
    });

    process.stderr.on('data', function (data) {
        process.stderr.write(data);
    });

    process.on('exit', function (status) {
        if (status !== 0) {
            process.stderr.write('child exited with non-zero status (' + status + ')');
        }
    });
};

Child.prototype.send = function (connection) {
    this.input.write('x', 'utf-8', connection.fd);
};

exports.runReload = function (options, nodePath, args, env, cwd) {
    var child = null,
        timeout;

    var server = net.createServer(function (connection) {
        connection.pause();

        if (! child || child.connections++ < 6) {
            child = new Child(nodePath, args, env, cwd);
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

function prepare (WebApp) {
    return promise.all(WebApp._protonBeforeStart || []);
}

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
    if (this._daemonise) {
        this.daemonModule().daemonise(this._pidfile, this._uid, this._gid, this._logdir);
    }
    var started    = new promise.Promise,
        webapp     = new this._WebApp,
        server     = this,
        httpServer = this.httpModule().createServer(function (request, response) {
            webapp.handle(request, response);
        }),
        start = function () {
            httpServer.listen(server._port, server._bindTo, function () {
                started.resolve(server._bindTo + ':' + server._port);
            });
        };
    if (webapp.onBeforeStart) {
        webapp.onBeforeStart().then(start);
    }
    else {
        start();
    }
    return started;
};

Server.prototype.httpModule = function () {
    return this._httpModule || http;
};

Server.prototype.setHttpModule = function (httpModule) {
    this._httpModule = httpModule;
};

Server.prototype.daemonModule = function () {
    return this._daemonModule || http
};

Server.prototype.setDaemonModule = function (daemonModule) {
    this._daemonModule = daemonModule;
};


