

var proton      = require('./proton'),
    options     = require('./options'),
    util       = require('util');
var optionsProcessor = new options.Processor({
    'name'        : 'proton',
    'description' : 'run proton web apps',
    'options'     : [
        { 'name': 'webapp',    'alias': 'w', 'value': 'path',   'default' : './lib/webapp.js',
          'description': 'relative path to the module containing the webapp' },
        { 'name': 'port',      'alias': 'p', 'value': 'number', 'default' : 8000,
           'description': 'the port to listen on' },
        { 'name': 'pidfile',   'alias': 'P', 'value': 'path',
          'description': 'file that the web app\'s PID should be written to' },
        { 'name': 'logdir',    'alias': 'l', 'value': 'path',
          'description': 'folder where logs should be written to' },
        { 'name': 'uid',       'alias': 'u', 'value': 'identifier',
          'description': 'username or uid that the web app should run as' },
        { 'name': 'gid',       'alias': 'g', 'value': 'identifier',
          'description': 'group name or gid that the web app should run as' },
        { 'name': 'silent',    'alias': 's', 'value': 'none',
          'description': 'run without sending output to the terminal' },
        { 'name': 'daemonise', 'alias': 'd', 'value': 'none',
          'description': 'detach from the terminal and deamonise after starting' },
        { 'name': 'reload',    'alias': 'r', 'value': 'none',
          'description': 'automatically pick up changes (do not use in production)' }
    ]
});

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
    this._args     = args = args.slice();
    this._nodePath = args.shift();
    this._cwd      = cwd;
    this._env      = env;
};

function onError (e) {
    util.error(e);
    process.exit(1);
};

Interface.prototype.run = function () {

    var options = optionsProcessor.process(this._args.slice(1), this._cwd);
    if (! options) {
        return;
    }

    options.port = options.port || 80;

    function onStart (boundTo) {
        if (! options.silent) {
            util.puts('webapp started on ' + boundTo);
        }
    }

    if (options.reload) {

        var cluster = require('cluster');

        if (cluster.isMaster) {

            var worker;
            function createWorker () {
                worker = cluster.fork();
                worker.on('message', function (msg) {
                    if (msg == proton.WORKER_HTTP_REQUEST) {
                        worker.disconnect();
                        createWorker();
                    }
                });
            };

            createWorker();

            onStart((options.bindTo || '0.0.0.0') + ':' + options.port);

        } else if (cluster.isWorker) {
            proton.runWorker(options, onError);
        }
    }
    else {

        var pkg    = require(options.webapp),
            WebApp = pkg.WebApp;

        proton.run(WebApp, options, onError).then(onStart);
    }
};