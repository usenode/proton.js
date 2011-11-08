
var net     = require('net'),
    http    = require('http'),
    promise = require('promised-io/promise');

var webappLoaded = new promise.Promise,
    webapp;

var serverReady = webappLoaded.then(function () {
    webapp = arguments[0];
    var server = http.createServer(function (request, response) {
        webapp.handle(request, response);
    });
    if (webapp.onBeforeStart) {
        return webapp.onBeforeStart().then(function () {
            return server;
        });
    }
    return server;
});

process.on('message', function (message, handle) {

    if (message.length > 1) {
        webappLoaded.resolve(new (require(message)));
        return;
    }

    promise.when(serverReady, function (server) {
        server.listen(handle, function () {
            // work around race condition caused by node not immediately accepting connections after child listens
            setTimeout(function () {
                process.send('x');
            }, 100);
        });
    });

});







