
var express = require('express'),
    app = express();

app.get('/', function(request, response){
  response.send('Hello, World!');
});

module.exports = function () { this.handle = app };

