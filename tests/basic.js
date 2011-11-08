
var litmus  = require('litmus'),
    proton  = require('..'),
    promise = require('promised-io/promise');

exports.test = new litmus.Test('basic proton tests', function () {
    var test = this;

    test.plan(11);

    test.is(typeof proton, 'object', 'proton namespace is an object');

    function testProton (options, name) {

        var server = new proton.Server(__dirname + '/mock', options.options),
            fireRequest;

        server.setHttpModule({
            createServer: function (callback) {
                server.webapp.events.push('create server called');
                fireRequest = function (request, response) {
                    callback(request, response);
                };
                return {
                    listen: function (port, host, callback) {
                        server.webapp.events.push(['listen called', port, host]);
                        callback(); 
                    }
                };
            }
        });

        server.setDaemonModule({
            daemonize: function (handles, pidfile, callback) {
                server.webapp.events.push(['daemoniser called', handles, pidfile, typeof callback]);
                callback();
            }
        });

        test.async(name, function (done) {
            server.start().then(function (listenAddress) {
                fireRequest('req', 'res');
                test.is(server.webapp.events, options.events, name);
                test.is(listenAddress, options.startCallbackParameter, name + ' listen address');
                done.resolve();
            });
        });
        
    };

    testProton({
        options: { single: true },
        events: [
            'instantiated',
            'create server called',
            'onBeforeStart called',
            'onBeforeStart running...',
            [ 'listen called', 80, '0.0.0.0' ],
            'handle called for req res'
        ],
        startCallbackParameter: '0.0.0.0:80'
    }, 'basic server');

    testProton({
        options: { single: true, port: 81 },
        events: [
            'instantiated',
            'create server called',
            'onBeforeStart called',
            'onBeforeStart running...',
            [ 'listen called', 81, '0.0.0.0' ],
            'handle called for req res'
        ],
        startCallbackParameter: '0.0.0.0:81'
    }, 'server on different port');

    testProton({
        options: { single: true, bindTo: '127.0.0.1' },
        events: [
            'instantiated',
            'create server called',
            'onBeforeStart called',
            'onBeforeStart running...',
            [ 'listen called', 80, '127.0.0.1' ],
            'handle called for req res'
        ],
        startCallbackParameter: '127.0.0.1:80'
    }, 'server bound to specific ip address'); 

    testProton({
        options: { single: true, bindTo: '127.0.0.1', port: 81 },
        events: [
            'instantiated',
            'create server called',
            'onBeforeStart called',
            'onBeforeStart running...',
            [ 'listen called', 81, '127.0.0.1' ],
            'handle called for req res'
        ],
        startCallbackParameter: '127.0.0.1:81'
    }, 'server bound to specific ip address and port'); 

    testProton({
        options: {
            single:    true,
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
            'onBeforeStart called',
            'onBeforeStart running...',
            [ 'listen called', 80, '0.0.0.0' ],
            'handle called for req res'
        ],
        startCallbackParameter: '0.0.0.0:80'
    }, 'daemonise');

});
