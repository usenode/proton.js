
var daemon = require('daemon'),
    fs     = require('fs'),
    stdin,
    stdout,
    stderr;

exports.daemonise = function (pidfile, uid, gid, logdir) {
    var pid = daemon.start();
    daemon.lock(pidfile);
    if (uid && gid) {
        process.setgid(gid);
        process.setuid(uid);
    }
    daemon.closeIO();
    // these work because they are in the right order after closeIO
    stdin  = fs.openSync('/dev/null', 'r');
    if (logdir) {
        stdout = fs.openSync(logdir + '/log', 'a');
        stderr = fs.openSync(logdir + '/errors', 'a');
    }
    else {
        stdout = fs.openSync('/dev/null', 'a');
        stderr = fs.openSync('/dev/null', 'a');
    }
    process.umask(027);
    process.chdir('/');
};

