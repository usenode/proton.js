
var litmus  = require('litmus'),
    proton  = require('..'),
    temp    = require('temp'),
    http    = require('http'),
    url     = require('url'),
    promise = require('promised-io/lib/promise');

exports.test = new litmus.Test('tests that run actual servers, daemonise, etc.', function () {
    var test = this;

    test.plan(1);

    var WebApp = function () {};

    WebApp.prototype.handle = function (request, response) {
        response.writeHead(200, { 'Content-Type': 'text/plain' });
        response.end('hello ' + request.url);
    };

    // TODO it would be nice to allow the OS to assign a free port by setting it to zero
    // this gives me "EACCES, Permission denied" with a normal user account on my mac, but
    // maybe we could do it conditionally if other platforms support it (or we're running as root?)
    var server = new proton.Server(WebApp, {
        port: 13000 + (new Date) % 4000,
        bindTo: '127.0.0.1'
    });
    
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
        server.start().then(function (boundTo) {
            get(boundTo, '/world').then(function (content) {
                test.is(content, 'hello /world', 'handled http request');
            }).then(function () {
                server.stop();
                handle.finish();
            });
        });
    });

});

