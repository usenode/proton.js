
var litmus  = require('litmus'),
    proton  = require('..'),
    promise = require('promised-io/promise');

exports.test = new litmus.Test('basic proton tests', function () {
    var test = this;

    test.plan(13);

    test.is(typeof proton, 'object', 'proton namespace is an object');

    function testProton (options, name) {
        var events = [];

        var Mock = function () {
            events.push('instantiated');
        };
    
        Mock.prototype.handle = function (request, response) {
            events.push('handle called for ' + request + ' ' + response);
        };

        if (options.setupMock) {
            options.setupMock(Mock, events);
        }

        var server = new proton.Server(Mock, options.options),
            fireRequest;

        server.setHttpModule({
            createServer: function (callback) {
                events.push('create server called');
                fireRequest = function (request, response) {
                    callback(request, response);
                };
                return {
                    listen: function (port, host, callback) {
                        events.push(['listen called', port, host]);
                        callback(); 
                    }
                };
            }
        });

        server.setDaemonModule({
            daemonize: function (handles, pidfile, callback) {
                events.push(['daemoniser called', handles, pidfile, typeof callback]);
                callback();
            }
        });

        test.async(name, function (handle) {
            server.start().then(function (listenAddress) {
                fireRequest('req', 'res');
                test.is(events, options.events, name);
                test.is(listenAddress, options.startCallbackParameter, name + ' listen address');
                handle.finish();
            });
        });
        
    };

    testProton({
        options: {},
        events: [
            'instantiated',
            'create server called',
            [ 'listen called', 80, '0.0.0.0' ],
            'handle called for req res'
        ],
        startCallbackParameter: '0.0.0.0:80'
    }, 'basic server');

    testProton({
        options: { port: 81 },
        events: [
            'instantiated',
            'create server called',
            [ 'listen called', 81, '0.0.0.0' ],
            'handle called for req res'
        ],
        startCallbackParameter: '0.0.0.0:81'
    }, 'server on different port');

    testProton({
        options: { bindTo: '127.0.0.1' },
        events: [
            'instantiated',
            'create server called',
            [ 'listen called', 80, '127.0.0.1' ],
            'handle called for req res'
        ],
        startCallbackParameter: '127.0.0.1:80'
    }, 'server bound to specific ip address'); 

    testProton({
        options: { bindTo: '127.0.0.1', port: 81 },
        events: [
            'instantiated',
            'create server called',
            [ 'listen called', 81, '127.0.0.1' ],
            'handle called for req res'
        ],
        startCallbackParameter: '127.0.0.1:81'
    }, 'server bound to specific ip address and port'); 

    testProton({
        options: {
            daemonise: true,
            pidfile:   '/a/pid/file',
            uid:       10,
            gid:       11,
            logdir:    '/a/log/dir'
        },
        events: [
            'instantiated',
            'create server called',
            ['daemoniser called', { stdout: '/a/log/dir/log', stderr: '/a/log/dir/errors' }, '/a/pid/file', 'function'],
            [ 'listen called', 80, '0.0.0.0' ],
            'handle called for req res'
        ],
        startCallbackParameter: '0.0.0.0:80'
    }, 'daemonise');

    testProton({
        options: {},
        events: [
            'instantiated',
            'create server called',
            'onBeforeStart called',
            'onBeforeStart promise waited for',
            [ 'listen called', 80, '0.0.0.0' ],
            'handle called for req res'
        ],
        startCallbackParameter: '0.0.0.0:80',
        setupMock: function (Mock, events) {
            Mock.prototype.onBeforeStart = function () {
                events.push('onBeforeStart called');
                var done = new promise.Promise();
                process.nextTick(function () {
                    events.push('onBeforeStart promise waited for');
                    done.resolve();
                });
                return done;
            };
        }
    }, 'onBeforeStart');
});
