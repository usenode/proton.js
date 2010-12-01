
var proton = require('proton'),
    sys    = require('sys');

var UserError = exports.UserError = function (message) {
    this._message = message;
};

UserError.prototype.toString = function () {
    return 'proton: ' + this._message;
};

var Interface = exports.Interface = function (cwd, args, env) {
    this._cwd  = cwd;
    this._args = args;
    this._env  = env;
};

Interface.prototype.run = function () {
    var path    = this._args[2],
        options = {};
    if (! path) {
        throw new UserError('path to webapp must be specified');
    }
    for (var i = 3, l = this._args.length; i < l; i++) {
        var match;
        if (match = this._args[i].match(/^\-\-(port)$/)) {
            options[match[1]] = this._args[++i];
        }
        else if (match = this._args[i].match(/^\-\-(silent)$/)) {
            options[match[1]] = true;
        }
        else {
            throw new UserError('unrecognised option ' + this._args[i]);
        }
    }
    var pkg = require(this._cwd + '/' + path);
    var webapp = pkg.webapp();
    proton.run(webapp, options).then(function (boundTo) {
        if (! options.silent) {
            sys.puts('webapp running on ' + boundTo);
        }
    });
};

