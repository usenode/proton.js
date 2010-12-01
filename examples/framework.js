
var proton = require('proton'),
    sys    = require('sys');

var WebApp = proton.framework(function (content) {
     this.content = content;
});

WebApp.prototype.handle = function (request) {
    return {
        status  : 200,
        headers : { 'Content-Type' : 'text/plain' },
            body    : [ this.content[ request.pathInfo ] ]
    };
};

exports.webapp = function (content) {
    return function () {
        return new WebApp(content);
    };
};
