
module.exports = function () {};

module.exports.prototype.handle = function (request, response) {
  response.writeHead(200, {'Content-Type': 'text/plain'});
  response.end('Hello World\n');
};

