
var sys = require('sys');

var UserError = exports.UserError = function (message) {
    this._message = message;
};

UserError.prototype.toString = function () {
    return this._message;
};

function makeAbsolutePath (base, path) {
    if (/^\//.test(path)) {
        return path;
    }
    if (path === '.') {
        return base;
    }
    return base + '/' + path.replace(/^\.\//, '');
}

var Processor = exports.Processor = function (params) {
    this._name = params.name;
    this._description = params.description;
    this._errorsTo = params.errorsTo || sys.error;
    var options = this._options = params.options.slice();
    this._byName = {};
    this._byAlias = {};
    for (var i = 0, l = options.length; i < l; i++) {
        this._byName[options[i].name] = options[i];
        if (options[i].alias) {
            this._byAlias[options[i].alias] = options[i];
        }
    }
};

Processor.prototype._validatorRegexp = function (name, value) {
    switch (value) {
        case 'number':
            return /^\d+$/;
        case 'path':
            return /\S+/;
        default:
            throw new Error('unknown option type ' + value);
    }
};

Processor.prototype._processOption = function (args, option, name, dir) {
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

Processor.prototype.setPostProcessor = function (postProcessor) {
    this._postProcessor = postProcessor;
};

Processor.prototype._processAliases = function (arg, args, result, dir) {
    for (var i = 1, ilen = arg.length; i < ilen; i++) {
        var alias = arg.charAt(i);
        if (alias in this._byAlias) {
            result[this._byAlias[alias]] = this._processOption(
                i < (ilen - 1) ? args : [],
                this._byAlias[alias],
                '-' + alias,
                dir
            );
        }
        else {
            throw new UserError(
                'unrecognised option -' + alias +
                (ilen > 2 ? ' (part of ' + arg + ')' : '')
            );
        }
    }
};

Processor.prototype._maxNameLength = function () {
    var res = 0;
    for (var i = 0, ilen = this._options.length; i < ilen; i++) {
        if (this._options[i].name.length > res) {
            res = this._options[i].name.length;
        }
    }
    return res;
};

function space (n) {
    var res = '';
    for (var i = 0; i < n; i++) {
        res += ' ';
    }
    return res;
}

Processor.prototype._helpText = function () {
    var maxLength = this._maxNameLength(),
        text      = this._name + ' - ' + this._description + '\n\n' +
               'Usage:\n' +
               '   proton [ options ]\n\n' +
               'Options:\n';
    for (var i = 0, ilen = this._options.length; i < ilen; i++) {
        text += '  --' + this._options[i].name +
                space(maxLength - this._options[i].name.length) +
                ' (-' + this._options[i].alias + ') ' +
                (this._options[i].value === 'none' ? '' : this._options[i].value.toUpperCase() + ' - ') +
                this._options[i].description +
                (('default' in this._options[i]) ? ' (default ' + this._options[i].default + ')' : '') +
                '\n';
    }
    return text;
};

Processor.prototype._processArgs = function (args, result, dir) {
    var result = {};
    for (var i in this._options) {
        if ('default' in this._options[i]) {
            result[this._options[i].name] = this._options[i].default;
        }
    }
    while (args.length) {
        var arg = args.shift();
        if (arg === '-h' || arg === '--help') {
            result.help = true;
            continue;
        }
        else if (match = arg.match(/^\-(\w+)$/)) {
            this._processAliases(arg, args, result, dir);
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
    return result;
};

Processor.prototype.process = function (args, dir) {
    try {
        var result = this._processArgs(args.slice(), result, dir);

        if (this._postProcessor) {
            this._postProcessor(result);
        }

        if (result.help) {
            sys.puts(this._helpText(result));
            return;
        }

        return result;
    }
    catch (e) {
        if (e instanceof UserError) {
            this._errorsTo(this._name + ': ' + e);
        }
        else {
            throw e;
        }
    }
};
