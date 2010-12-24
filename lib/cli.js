
var proton  = require('proton'),
    options = require('proton/options'),
    sys     = require('sys');

var optionsProcessor = new options.Processor(
    { 'name': 'webapp',    'alias': 'w', 'value': 'path',   'default' : 'lib/webapp.js' },
    { 'name': 'port',      'alias': 'p', 'value': 'number', 'default' : 8000 },
    { 'name': 'pidfile',   'alias': 'P', 'value': 'path' },
    { 'name': 'logdir',    'alias': 'l', 'value': 'path' },
    { 'name': 'uid',       'alias': 'u', 'value': 'identifier' },
    { 'name': 'gid',       'alias': 'g', 'value': 'identifier' },
    { 'name': 'silent',    'alias': 's', 'value': 'none' },
    { 'name': 'daemonise', 'alias': 'd', 'value': 'none' },
    { 'name': 'noreload',  'alias': 'n', 'value': 'none' }
);

optionsProcessor.setPostProcessor(function (options) {
    var match;
    if (options.uid) {
        if (match = options.uid.match(/^(\w+):(\w+)$/)) {
            if (options.gid) {
                throw new options.UserError('gid specified with uid and as a separate option');
            }
            options.uid = match[1];
            options.gid = match[2];
        }
        else if (! options.gid) {
            throw new options.UserError('gid option (--gid|-g) must be specified when uid is present');
        }
    }
    if (options.gid && ! options.uid) {
        throw new options.UserError('uid option (--uid|-u) must be specified when gid is present');
    }
    if (options.daemonise) {
        if (! options.pidfile) {
            throw new options.UserError('pidfile must be specified when daemonise option is present');
        }
    }
});

var Interface = exports.Interface = function (cwd, args, env) {
    var args         = args.slice();
    this._nodePath   = args.shift();
    this._protonPath = args.shift();
    this._cwd        = cwd;
    this._args       = args;
    this._env        = env;
};

function onError (e) {
    sys.error(e);
    process.exit(1);
};

Interface.prototype.run = function () {
    var options = optionsProcessor.process(this._args, this._cwd);
    if (! options) {
        return;
    }

    var pkg    = require(this._cwd + '/' + options.webapp),
        webapp = pkg.webapp();
 
    proton.run(webapp, options, onError).then(function (boundTo) {
        if (! options.silent) {
            sys.puts('webapp started on ' + boundTo);
        }
    });
};

