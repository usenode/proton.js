
module.exports = function () {};

var started = new Date();

module.exports.prototype.handle = function (request, response) {
  response.writeHead(200, {'Content-Type': 'text/plain'});
  response.end(
      'started: ' + started + '\n' +
      'running: ' + (new Date() - started) + '\n' +
      'pid:     ' + process.pid + '\n'
    );
};
