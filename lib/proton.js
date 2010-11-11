
var jsgi     = require("jsgi/jsgi-node"),
    promise  = require("promised-io/promise"),
    http     = require("http"),
    sys      = require("sys");

var WebAppContext = function (webapp) {
    this.server = http.createServer(new jsgi.Listener(function (request) {
        return webapp.handle(request);
    }));
    this._beforeStart = [];
};

WebAppContext.prototype.beforeStart = function (promise) {
    this._beforeStart.push(promise);
};

var newApplied = {};

exports.framework = function (proto) {
    return function () {
        if (! (this instanceof arguments.callee)) {
            return new arguments.callee(newApplied, arguments);
        }
        this.context = new WebAppContext(this);
        if (arguments[0] === newApplied) {
            proto.apply(this, arguments[1]);
        }
        else {
            proto.apply(this, arguments);
        }
    };
};

exports.run = function (webapp, options) {
    if (! options) {
        options = {};
    }
    promise.all(webapp.context._beforeStart).then(function () {
        webapp.context.server.listen(options.port || 80, options.bindTo);
    });
};

