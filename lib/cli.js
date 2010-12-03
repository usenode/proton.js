
var proton = require('proton'),
    sys    = require('sys');

var UserError = exports.UserError = function (message) {
    this._message = message;
};

UserError.prototype.toString = function () {
    return 'proton: ' + this._message;
};

var OptionsProcessor = function (options) {
    this._options = options;
    this._byName = {};
    this._byAlias = {};
    for (var i = 0, l = options.length; i < l; i++) {
        this._byName[options[i].name] = options[i];
        if (options[i].alias) {
            this._byAlias[options[i].alias] = options[i];
        }
    }
};

OptionsProcessor.prototype._validatorRegexp = function (name, type) {
    switch (type) {
        case 'number':
            return /^\d+$/;
        case 'path':
            return /\S+/;
        default:
            throw new Error('unknown option type ' + type);
    }
};

OptionsProcessor.prototype._processOption = function (result, args, option, name) {
    if (option.value === 'none') {
        return true;
    }
    if (! args.length) {
        throw new UserError('missing argument for ' + name + ' option');
    }
    var result = args.shift(),
        validator = this._validatorRegexp(name, option.type);
    if (! validator.test(result)) {
        throw new UserError('value for option ' + name + ' is not a valid ' + option.type);
    }
    return result;
};

OptionsProcessor.prototype.process = function (args) {
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
            }
        }
        else if (match = arg.match(/^\-\-(\w+)$/)) {
            if (match[1] in this._byName) {
                result[this._byName[match[1]]] = this._processOption(args, this._byName[match[1]], '--' + match[1]);
            }
        }
        else {
            throw new UserError('unrecognised option ' + arg);
        }        
    }

    return result;
};

var optionsProcessor = new OptionsProcessor(
    { 'name': 'port',      'alias': 'p', 'value': 'number' },
    { 'name': 'pidfile',   'alias': 'P', 'value': 'path' },
    { 'name': 'logdir',    'alias': 'l', 'value': 'path' },
    { 'name': 'silent',    'alias': 's', 'value': 'none' },
    { 'name': 'daemonise', 'alias': 'd', 'value': 'none' },
    { 'name': 'noreload',  'alias': 'n', 'value': 'none' }
);

var Interface = exports.Interface = function (cwd, args, env) {
    var args = args.slice();
    this._nodePath = args.shift();
    this._protonPath = args.shift();
    this._cwd  = cwd;
    this._args = args;
    this._env  = env;
};

function extractStack (stack) {
    var frames = stack.split(/\n\s*/);
    frames.shift(); // message
    return frames.map(function (frame) {
        var match = frame.match(/^at (.+) \((.+?):(\d+):(\d+)\)$/) || frame.match(/^at ()(.+?):(\d+):(\d+)$/);
        if (! match) {
            throw new Error('could not extract data from stack frame: ' + frame);
        }
        return {
            func: match[1],
            file: match[2],
            line: match[3],
            char: match[4]
        };
    });
}

/* Parent process

function daemonise () {
    var pid = daemon.start();
    daemon.lock("/var/run/suzuka.pid");
    dropPrivileges();
    daemon.closeIO();
    stdin  = fs.openSync('/dev/null', 'r');
    stdout = fs.openSync('/var/log/suzuka/log', 'a');
    stderr = fs.openSync('/var/log/suzuka/errors', 'a');
    process.umask(027);
    process.chdir('/');
}

function dropPrivileges () {
    try {
        process.setgid('suzuka');
        process.setuid('suzuka');
    }
    catch (err) {
        sys.error('failed to set user and group');
        process.exit(1);
    }
}
*/

function formatStack (stack) {
    var result = 'Stack trace:\n';

    for (var i = 0, ilen = stack.length; i < ilen; i++) {
        var frame = stack[i];
        result += '    ' + frame.file + ' line ' + frame.line + ', char ' + frame.char + ' (' + frame.func + ')\n';
    }

    return result;
}

Interface.prototype.run = function () {
    try {
        var path    = this._args.shift();
        if (! path) {
            throw new UserError('path to webapp must be specified');
        }
        var options = optionsProcessor.process(this._args),
            pkg     = require(this._cwd + '/' + path),
            webapp  = pkg.webapp();
        proton.run(webapp, options).then(function (boundTo) {
            if (! options.silent) {
                sys.puts('webapp running on ' + boundTo);
            }
        });
    }
    catch (e) {
        if (e instanceof UserError) {
            sys.error(e);
            process.exit(1);
        }
        else {
            var stack = extractStack(e.stack);
            sys.error(
                e + '\n' +
                '    at ' + stack[0].file + ' line ' + stack[0].line + ', char ' + stack[0].char + '\n' + 
                '    (' + stack[0].func + ')\n' +
                '\n' + formatStack(stack)
            );
            process.exit(1);
        }
    }
};

