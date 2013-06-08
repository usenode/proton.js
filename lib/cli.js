
var proton            = require('./proton'),
    options_processor = require('./options'),
    util              = require('util'),
    cluster           = require('cluster'),
    os                = require('os'),
    fs                = require('fs'),
    child_process     = require('child_process');

var UserError = function (message) {
    this._message = message;
};

UserError.prototype.toString = function () {
    return 'proton: ' + this._message;
};

var optionsProcessor = new options_processor.Processor({
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
        { 'name': 'nofork',    'alias': 'n', 'value': 'none',
          'description': 'run as a single process (for debugging purposes)' },
        { 'name': 'processes', 'alias': 'c', 'value': 'number', 'default': os.cpus().length, defaultDescription: 'no. of cores',
          'description': 'number of processes to use when neither reload or nofork is specified' },
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
                throw new options_processor.UserError('gid specified with uid and as a separate option');
            }
            options.uid = match[1];
            options.gid = match[2];
        }
        else if (! options.gid) {
            throw new options_processor.UserError('gid option (--gid|-g) must be specified when uid is present');
        }
    }
    if (options.gid && ! options.uid) {
        throw new options_processor.UserError('uid option (--uid|-u) must be specified when gid is present');
    }
    if (options.daemonise) {
        if (! options.pidfile) {
            throw new options_processor.UserError('pidfile must be specified when daemonise option is present');
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

function getServerClass (options) {
    if (options.reload) {
        return cluster.isMaster ?
            proton.ReloadingServer :
            proton.ReloadingChildServer;
    }
    else if (options.nofork) {
        return proton.SingleProcessServer;
    }
    else {
        return cluster.isMaster ?
            proton.MultipleProcessServer :
            proton.SingleProcessServer;
    }
}

function daemonise (options) {
    if (! process.env.PROTON_DAEMONISED) {
        process.env.PROTON_DAEMONISED = 1;
        // TODO: this is temporary logging functionality until it can be handled post daemonisation.
        //       Doing it this way means it can't be reopened on HUP, which is bad for logrotate.
        //       Needs cluster to support stdio option below (or something else) - see disabled
        //       logging functionality in the proton module.
        var stdout, stderr;
        if (options.logdir) {
            var logdirInfo;
            try {
                logdirInfo = fs.readdirSync(options.logdir);
            }
            catch (e) {
                if (fs.existsSync(options.logdir)) {
                    throw new UserError('logdir exists and is not a directory');
                }
                fs.mkdirSync(options.logdir);
            }
            stdout = fs.openSync(options.logdir + os.directorySeparator + 'log', 'a');
            stderr = fs.openSync(options.logdir + os.directorySeparator + 'errors', 'a');
        }

        child_process.spawn(process.execPath, process.argv.slice(1), {
            detached : true,
            stdio    : [ 'ignore', stdout || 'ignore', stderr || 'ignore' ],
            uid      : options.uid,
            gid      : options.gid
        }).unref();
        process.exit(0);
    }
}

Interface.prototype.run = function () {
    var options = optionsProcessor.process(this._args.slice(1), this._cwd);
    if (! options) {
        return;
    }
    
    if (options.daemonise) {
        try {
            daemonise(options);
        }
        catch (e) {
            if (e instanceof UserError) {
                console.error(e.toString());
                process.exit(1);
            }
            throw e;
        }
    }

    var Server = getServerClass(options);
    var server = new Server(options);

    // graceful shutdown
    process.on('SIGQUIT', function () {
        if (cluster.isMaster) {
            console.log('stoppping...');
        }
        server.stop().then(function () {
            process.exit(0);
        });
    });
    
    // gracefull reload
    process.on('SIGHUP', function () {
        server.gracefulReload();
    });

    server.run().then(
        function (boundTo) {
            if (! options.silent && cluster.isMaster) {
                util.puts('webapp started on ' + boundTo);
            }
        },
        function (message) {
            throw message;
        }
    );
};

