
var Webapp = module.exports = function () {
    this._createdAt = (new Date()).getTime();
};

Webapp.prototype.handle = function (request, response) {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end(
        'url: ' + request.url + '\n' +
        'pid: ' + process.pid + '\n' +
        'created at: ' + this._createdAt
    );
    if (response.url === '/stop') {
        process.nextTick(function () {
            process.exit(0);
        });
    }
};

