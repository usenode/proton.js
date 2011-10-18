
var litmus        = require('litmus'),
    proton        = require('..'),
    temp          = require('temp'),
    http          = require('http'),
    child_process = require('child_process'),
    promise       = require('promised-io/promise'),
    fs            = require('fs');

exports.test = new litmus.Test('tests that run actual servers, daemonise, etc.', function () {
    var test = this;

    test.plan(3);

    var WebApp = function () {};

    WebApp.prototype.handle = function (request, response) {
        response.writeHead(200, { 'Content-Type': 'text/plain' });
        response.end('hello ' + request.url);
    };

    function makeServerOptions (options) {
        if (! options) {
            options = {};
        }
        options.bindTo = '127.0.0.1';
        // TODO it would be nice to allow the OS to assign a free port by setting it to zero
        // this gives me "EACCES, Permission denied" with a normal user account on my mac, but
        // maybe we could do it conditionally if other platforms support it (or we're running as root?)
        options.port = 13000 + (new Date) % 4000;
        return options;
    }
    
    function makeServer (proton, options) {
        return new proton.Server(WebApp, makeServerOptions(options));
    }

    function get (address, path) {
        var done = new promise.Promise,
            host = address.split(':')[0],
            port = address.split(':')[1];
        http.get({
            host: host,
            port: port,
            path: path
        }, function (response) {
            var content = '';
            response.on('data', function (data) {
                content += data;
            });
            response.on('end', function () {
                done.resolve(content);
            });
        });
        return done;
    }

    test.async('run server', function (handle) {
        var server = makeServer(proton);
        server.start().then(function (boundTo) {
            get(boundTo, '/world').then(function (content) {
                test.is(content, 'hello /world', 'handled http request');
            }).then(function () {
                server.stop();
                handle.finish();
            });
        });
    });

    test.async('daemonise', function (handle) {
        temp.mkdir('proton-test-daemonise', function (err, tempdir) {
            if (err) {
                throw err;
            }
            var pidfile = tempdir + '/pid',
                child   = child_process.fork(__filename);
            child.send(makeServerOptions({
                daemonise: true,
                pidfile:   pidfile,
                logdir:    tempdir
            }));
            waitForServerStart(tempdir + '/log').then(function (boundTo) {
                get(boundTo, '/hello').then(function (response) {
                    var match = response.match(/Hello from (\d+) \(\/hello\)/);
                    test.ok(match, 'got response from daemonised server');
                    test.is(fs.readFileSync(pidfile, 'utf-8'), match[1], 'pidfile written');
                    get(boundTo, '/stop').then(function () {
                        handle.finish();
                    });
                });
            });
        });
    });
});

function waitForServerStart (logfile) {
    var done = new promise.Promise(),
        match,
        tries = 0,
        interval = setInterval(function () {
            try {
                if (match = fs.readFileSync(logfile, 'utf-8').match(/started on (\d+\.\d+\.\d+\.\d+:\d+)/)) {
                    clearInterval(interval);
                    done.resolve(match[1]);
                }
            }
            catch (e) {
                if (! e.code === 'ENOENT') {
                    clearInterval(interval);
                    throw new Error('unexpected error trying to read logfile');
                }
            }
            if (tries++ > 40) {
                clearInterval(interval);
                //throw new Error('timed out while waiting for server start');
            }
        }, 50);
    return done;
}

if (process.argv[1] === __filename) {

    // ensure we don't leave subprocess hanging around
    setTimeout(function () {
        process.exit(1);
    }, 10000);

    process.on('message', function (options) {
        var WebApp = function () {},
            server = new proton.Server(WebApp, options);

        WebApp.prototype.handle = function (request, response) {
            response.writeHead(200, { 'Content-Type': 'text/plain' });
            response.end('Hello from ' + process.pid + ' (' + request.url + ')'); 
            if (request.url === '/stop') {
                server.stop();
                process.exit(0);
            }
        };

        server.start().then(function (boundTo) {
            // this goes into the log, to be read by the other side
            console.log('started on ' + boundTo);
        });
    });

}

