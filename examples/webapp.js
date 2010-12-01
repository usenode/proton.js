
var proton = require('proton');

exports.WebApp = proton.framework(function () {
     // initialise the webapp here
});

exports.WebApp.prototype.handle = function (request) {
    return {
        status  : 200,
        headers : { 'Content-Type' : 'text/plain' },
        body    : [ "Hello, World\n" ]
    };
};
