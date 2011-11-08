
var litmus        = require('litmus'),
    proton        = require('..'),
    temp          = require('temp'),
    http          = require('http'),
    child_process = require('child_process'),
    promise       = require('promised-io/promise'),
    fs            = require('fs'),
    delay         = require('promised-io/delay').delay;

exports.test = new litmus.Test('tests that run actual servers, daemonise, etc.', function () {
    var test = this;

    test.plan(14);

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
        return new proton.Server(__dirname + '/webapp', makeServerOptions(options));
    }

    function get (address, path, agent) {
        var done = new promise.Promise,
            host = address.split(':')[0],
            port = address.split(':')[1];
        http.get({
            host: host,
            port: port,
            path: path,
            agent: agent
        }, function (response) {
            var content = '';
            response.on('data', function (data) {
                content += data;
            });
            response.on('end', function () {
                done.resolve(content);
            });
        }).on('error', function(e) {
            done.reject('could not get http://' + address + path + ' - ' + e);
        });
        return done;
    }

    test.async('run server', { timeout: 1000 }, function (done) {
        var server = makeServer(proton);
        server.start().then(function (boundTo) {
            done.then(function () {
                server.stop();
            }, function () {
                server.stop();
            });

            //setTimeout(function () {
            get(boundTo, '/world').then(function (content) {
                test.like(content, /url: \/world/, 'handled http request');
            }).then(function () {
                done.resolve();
            }, function (err) {
                done.reject(err);
            });
            //}, 100);
        });
    });

    test.async('daemonise', { "timeout" : 100000 }, function (done) {
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
            console.log(tempdir);
            waitForServerStart(tempdir + '/log').then(function (boundTo) {
                console.log('server started');
                get(boundTo, '/hello').then(function (response) {
                    var match = response.match(/url: \/hello\npid: (\d+)/);
                    test.ok(match, 'got response from daemonised server');
                    test.is(fs.readFileSync(pidfile, 'utf-8'), match[1], 'pidfile written');
                    process.kill();
                        done.resolve();
                });
            });
        });
    });

    return;

    test.async('reload', { timeout: 10000 }, function (done) {
        var server = makeServer(proton, { reload: true });
        server.start().then(function (address) {
            var agent   = new http.Agent,
                created = [];

            function makeRequests () {
                var requests     = [],
                    requestsMade = promise.Promise();;
                for (var i = 0; i < 10; i++) {
                    requests.push(get(address, '/hello', agent));
                }
                
                promise.all(requests).then(function (responses) {
                    created.push(responses.map(function (response) {
                        return response.match(/created at: (\d+)/)[1];
                    }));
                    requestsMade.resolve();
                });
                return requestsMade;
            }

            makeRequests().then(function () {
                test.is(created[0].length, 10, 'initial set of responses received');
                test.like(created[0][0], /^[1-9]\d*$/, 'initial created is integer greater than zero');
                test.is(created[0], times(created[0][0], 10), 'all initial requests handled by webapp created at same time');
                return delay(1000).then(makeRequests);
            }).then(function () {
                test.is(created[1].length, 10, 'second set of responses received');
                test.like(created[1][0], /^[1-9]\d*$/, 'second created is integer greater than zero');
                test.is(created[1][0], created[0][0], 'second created time same as initial');
                test.is(created[1], times(created[1][0], 10), 'all second requests handled by webapp created at same time');
                return delay(3000).then(makeRequests);
            }).then(function () {
                test.is(created[2].length, 10, 'third set of responses received');
                test.like(created[2][0], /^[1-9]\d*$/, 'third created is integer greater than zero');
                test.gt(created[2][0], created[1][0], 'third created time after initial');
                test.is(created[1], times(created[1][0], 10), 'all third requests handled by webapp created at same time');
                server.stop();
                done.resolve();
            });
        }); 
    });
});

function times (d, times) {
    var expect = [];
    for (var i = 0; i < times; i++) {
        expect.push(d);
    }
    return expect;
}

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
        var server = new proton.Server(__dirname + '/webapp', options);

        server.start().then(function (boundTo) {
            // this goes into the log, to be read by the other side
            console.log('started on ' + boundTo);
        });
    });

}

