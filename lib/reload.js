
var net     = require('net'),
    http    = require('http'),
    promise = require('promised-io/promise');

var webappLoaded = new promise.Promise,
    webapp,
    connections = 0,
    countdown,
    exiting = false;

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

    connections++;

    if (countdown) {
        clearTimeout(countdown);
    }

    var connection = new net.Socket({
        handle        : handle,
        type          : 'tcp4',
        allowHalfOpen : false // right?
    });

    connection.readable = connection.writable = true;

    // confirm receipt of the connection
    process.send('');

    connection.on('close', function () {
        if (--connections === 0) {
            if (countdown) {
                clearTimeout(countdown);
            }

            countdown = setTimeout(function () {
                process.exit(0);
            }, 2000);
        }
    });

    promise.when(serverReady, function (server) {
        server.emit('connection', connection);
        connection.resume();
    });
});   

