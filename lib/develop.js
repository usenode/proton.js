
var fs       = require('promised-io/fs'),
    promise  = require('promised-io/promise'),
    micro    = require('micro'),
    spectrum = require('spectrum'),
    sys      = require('sys');


exports.webapp = micro.webapp(function (get, post) {

    var webapp = this;

    this.setBase = function (base) {
        this._base = base;
    };
    
    this.view = new spectrum.Renderer(__dirname + '/../views');

    function projects (dir) {
        return fs.readdir(dir).then(function (dirs) {
            return promise.all(dirs.map(function (name) {
                var projectFile = dir + '/' + name + '/project.json';
                return fs.stat(projectFile).then(function () {
                    return fs.readFile(projectFile).then(function (contents) {
                        return {
                            'name' : name,
                            'data' : JSON.parse(contents)
                        };
                    });
                }, function () {
                    return;
                });
            })).then(function (contents) {
                return contents.filter(function (content) {
                    return typeof(content) !== 'undefined';
                });
            });
        });
    }

    get('/', function (request) {
        var response = this,
            projectsDir = webapp._base + '/projects';
        return promise.all([
            fs.stat(webapp._base),
            fs.stat(projectsDir)
        ]).then(function () {
            return projects(projectsDir).then(function (projects) {
                return response.render('/index.spv', { projects: projects });
            });
        }, function () { return response.render('/setup.spv', {}); });
    });

    this.handleStatic(__dirname.replace(/\/lib$/, '/static'));
});

