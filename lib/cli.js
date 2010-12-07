
var proton = require('proton'),
    sys    = require('sys');

var UserError = exports.UserError = function (message) {
    this._message = message;
};

UserError.prototype.toString = function () {
    return 'proton: ' + this._message;
};

function makeAbsolutePath (base, path) {
    if (/^\//.test(path)) {
        return path;
    }
    if (path === '.') {
        return base;
    }
    return path.replace(/^\.\//, '') + path;
}

var OptionsProcessor = function () {
    var options = this._options = Array.prototype.slice.call(arguments);
    this._byName = {};
    this._byAlias = {};
    for (var i = 0, l = options.length; i < l; i++) {
        this._byName[options[i].name] = options[i];
        if (options[i].alias) {
            this._byAlias[options[i].alias] = options[i];
        }
    }
};

OptionsProcessor.prototype._validatorRegexp = function (name, value) {
    switch (value) {
        case 'number':
            return /^\d+$/;
        case 'path':
            return /\S+/;
        default:
            throw new Error('unknown option type ' + value);
    }
};

OptionsProcessor.prototype._processOption = function (args, option, name, dir) {
    if (option.value === 'none') {
        return true;
    }
    if (! args.length) {
        throw new UserError('missing argument for ' + name + ' option');
    }
    var result    = args.shift(),
        validator = this._validatorRegexp(name, option.value);
    if (option.value === 'path') {
        result = makeAbsolutePath(dir, result);
    }
    if (! validator.test(result)) {
        throw new UserError('value for option ' + name + ' is not a valid ' + option.type);
    }
    return result;
};

OptionsProcessor.prototype.setPostProcessor = function (postProcessor) {
    this._postProcessor = postProcessor;
};

OptionsProcessor.prototype.process = function (args, dir) {
    var result = {},
        match,
        args = args.slice();

    while (args.length) {
        var arg = args.shift();
        if (match = arg.match(/^\-(\w+)$/)) {
            for (var i = 1, ilen = arg.length; i < ilen; i++) {
                var alias = arg.charAt(i);
                if (alias in this._byAlias) {
                    result[this._byAlias[alias]] = this._processOption(i < (ilen - 1) ? args : [], this._byAlias[alias], '-' + alias);
                }
                else {
                    throw new UserError(
                        'unrecognised option -' + alias +
                        (ilen > 2 ? ' (part of ' + arg + ')' : '')
                    );
                }
            }
            continue;
        }
        else if (match = arg.match(/^\-\-(\w+)$/)) {
            if (match[1] in this._byName) {
                result[this._byName[match[1]].name] = this._processOption(args, this._byName[match[1]], '--' + match[1], dir);
                continue;
            }
        }
        throw new UserError('unrecognised option ' + arg);
    }

    if (this._postProcessor) {
        this._postProcessor(result);
    }

    return result;
};

var optionsProcessor = new OptionsProcessor(
    { 'name': 'port',      'alias': 'p', 'value': 'number' },
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
                throw new UserError('gid specified with uid and as a separate option');
            }
            options.uid = match[1];
            options.gid = match[2];
        }
        else if (! options.gid) {
            throw new UserError('gid option (--gid|-g) must be specified when uid is present');
        }
    }
    if (options.gid && ! options.uid) {
        throw new UserError('uid option (--uid|-u) must be specified when gid is present');
    }
    if (options.daemonise) {
        if (! options.pidfile) {
            throw new UserError('pidfile must be specified when daemonise option is present');
        }
    }
});

var Interface = exports.Interface = function (cwd, args, env) {
    var args = args.slice();
    this._nodePath = args.shift();
    this._protonPath = args.shift();
    this._cwd  = cwd;
    this._args = args;
    this._env  = env;
};

Interface.prototype.run = function () {
    var onError = function (e) {
        if (! (e instanceof UserError)) {
            sys.error('proton: error while starting web application\n\n' + e);
        }
        else {
            sys.error(e);
        }
        process.exit(1);

    };
    try {
        var path    = this._args.shift();
        if (! path) {
            throw new UserError('path to webapp must be specified');
        }
        var cwd = this._cwd,
            pkg     = require(this._cwd + '/' + path),
            webapp  = pkg.webapp(),
            options = optionsProcessor.process(this._args, this._cwd);

        proton.run(webapp, options, onError).then(function (boundTo) {
            if (! options.silent) {
                sys.puts('webapp started on ' + boundTo);
            }
        });
    }
    catch (e) {
        onError(e);
    }
};

