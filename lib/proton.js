
var jsgi        = require('jsgi'),
    promise     = require('promised-io/lib/promise'),
    fs          = require('fs'),
    daemon      = require('daemon'),
    net         = require('net'),
    net_binding = process.binding('net'),
    http        = require('http'),
    spawn       = require('child_process').spawn,
    stdin,
    stdout,
    stderr;

function extractStack (stack) {
    var frames = stack.split(/\n\s*/);
    frames.shift(); // message
    return frames.map(function (frame) {
        var match = frame.match(/^at (.+) \((.+?):(\d+):(\d+)\)$/) || frame.match(/^at ()(.+?):(\d+):(\d+)$/);
        if (! match) {
            throw new Error('could not extract data from stack frame: ' + frame);
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

function daemonise (pidfile, uid, gid, logdir) {
    var pid = daemon.start();
    daemon.lock(pidfile);
    if (uid && gid) {
        dropPrivileges(uid, gid);
    }
    daemon.closeIO();
    // these work because they are in the right order after closeIO
    stdin  = fs.openSync('/dev/null', 'r');
    if (logdir) {
        stdout = fs.openSync(logdir + '/log', 'a');
        stderr = fs.openSync(logdir + '/errors', 'a');
    }
    else {
        stdout = fs.openSync('/dev/null', 'a');
        stderr = fs.openSync('/dev/null', 'a');
    }
    process.umask(027);
    process.chdir('/');
}

function dropPrivileges (uid, gid) {
    process.setgid(gid);
    process.setuid(uid);
}

exports.beforeStart = function (WebApp, beforeStart) {
    if (! WebApp._protonBeforeStart) {
        WebApp._protonBeforeStart = [];
    }
    WebApp._protonBeforeStart.push(beforeStart);
};

exports.runReload = function (options, nodePath, args, env, cwd) {
    var server = net.createServer(function (connection) {
        connection.pause();

        var pipe  = net_binding.socketpair(),
            input = new net.Stream(pipe[0], 'unix'),
            child = spawn(nodePath, args, {
                customFds : [pipe[1], -1, -1],
                env       : env,
                cwd       : cwd
            });

        input.write('x', 'utf-8', connection.fd);

        child.stdout.on('data', function (data) {
            process.stdout.write(data);
        });

        child.stderr.on('data', function (data) {
            process.stderr.write(data);
        });

        child.on('exit', function (status) {
            if (status !== 0) {
                process.stderr.write('child exited with non-zero status (' + status + ')');
            }
        });
    });
    server.listen(options.port || 80, options.bindTo);
    return (options.bindTo || '0.0.0.0') + ':' + (options.port || 80);
};

function prepare (WebApp) {
    return promise.all(WebApp._protonBeforeStart || []);
}

exports.runSingleConnection = function (WebApp, options, onError) {
    var stdin   = new net.Stream(0, 'unix');
    stdin.addListener('fd', function (fd) {
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
                        process.exit(0);
                    }, 2000);
                });
                return done;
            }));
        webapp.protonServer = server;
        socket.on('close', function () {
            process.exit(0);
        });
        socket.readable = socket.writable = true;
        prepare(WebApp).then(function () {
            server.emit('connection', socket);
            socket.resume();
        });
    });
    stdin.resume();
};

exports.run = decorateError(function (WebApp, options, onError) {
    if (! options) {
        options = {};
    }
    if (options.daemonise) {
        daemonise(options.pidfile, options.uid, options.gid, options.logdir);
    }
    var webapp = new WebApp(),
        server = http.createServer(new jsgi.Listener(function (request) {
            return webapp.handle(request);
        }));
    webapp.protonServer = server;
    return prepare(WebApp).then(decorateError(function () {
        server.listen(options.port || 80, options.bindTo);
        return (options.bindTo || '0.0.0.0') + ':' + (options.port || 80);
    }, onError));
});

