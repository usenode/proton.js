
var litmus = require('litmus'),
    proton = require('..');

exports.test = new litmus.Test('basic proton tests', function () {
    var test = this;

    test.plan(9);

    test.is(typeof proton, 'object', 'proton namespace is an object');

    function testProton (options, expectedEvents, expectedListenAddress, name) {
        var events = [];

        var Mock = function () {
            events.push('instantiated');
        };
    
        Mock.prototype.handle = function (request, response) {
            events.push('handle called for ' + request + ' ' + response);
        };

        var server = new proton.Server(Mock, options),
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

        test.async(name, function (handle) {
            server.start().then(function (listenAddress) {
                fireRequest('req', 'res');
                test.is(events, expectedEvents, name);
                test.is(listenAddress, expectedListenAddress, name + ' listen address');
                handle.finish();
            });
        });
        
    };

    testProton(
        {},
        [
            'instantiated',
            'create server called',
            [ 'listen called', 80, '0.0.0.0' ],
            'handle called for req res'
        ],
        '0.0.0.0:80',
        'basic server'
    );

    testProton(
        { port: 81 },
        [
            'instantiated',
            'create server called',
            [ 'listen called', 81, '0.0.0.0' ],
            'handle called for req res'
        ],
        '0.0.0.0:81',
        'server on different port'
    );

    testProton(
        { bindTo: '127.0.0.1' },
        [
            'instantiated',
            'create server called',
            [ 'listen called', 80, '127.0.0.1' ],
            'handle called for req res'
        ],
        '127.0.0.1:80',
        'server bound to specific ip address'
    ); 

    testProton(
        { bindTo: '127.0.0.1', port: 81 },
        [
            'instantiated',
            'create server called',
            [ 'listen called', 81, '127.0.0.1' ],
            'handle called for req res'
        ],
        '127.0.0.1:81',
        'server bound to specific ip address and port'
    ); 
});
