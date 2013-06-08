Introduction
============

Proton is a tiny web-server for node.js.

Node makes it really easy to write a web-server if that's what you want to do - personally I don't want to write one every time I write a webapp, so I wrote Proton. Its main goal is be as small as possible, while supporting the ability to:

* Run as a development server, reloading your code without needing restarts (and doing so fast enough so you don't notice).
* Run as a production server, daemonising, dropping privileges, utilising multiple cores, etc.

Options
=======

Running "proton --help" shows these options:

    proton - run proton web apps
    
    Usage:
       proton [ options ]
    
    Options:
      --webapp    (-w) PATH - relative path to the module containing the webapp (default ./lib/webapp.js)
      --port      (-p) NUMBER - the port to listen on (default 8000)
      --pidfile   (-P) PATH - file that the web app's PID should be written to
      --logdir    (-l) PATH - folder where logs should be written to
      --uid       (-u) IDENTIFIER - username or uid that the web app should run as
      --gid       (-g) IDENTIFIER - group name or gid that the web app should run as
      --silent    (-s) run without sending output to the terminal
      --nofork    (-n) run as a single process (for debugging purposes)
      --processes (-c) NUMBER - number of processes to use when neither reload or nofork is specified (default 2 - no. of cores)
      --daemonise (-d) detach from the terminal and deamonise after starting
      --reload    (-r) automatically pick up changes (do not use in production)

Examples
========

Writing a Web Appliction
------------------------

You could use it to create a web appliction (say in lib/webapp.js), which is simply a class (insomuch that anything is a class in JavaScript) that is instantiated by Proton and has its handle method invoked for each HTTP request:

    var proton = require('proton');
    
    var Webapp = module.exports = function () {
         // initialise the webapp here
    };
    
    // function is just as if you used the http module directly
    Webapp.prototype.handle = function (request, response) {
        response.writeHead(200, { 'Content-Type': 'text/plain' });
        response.end('Hello World!');
    };
    
Each web application built on Proton (or hopefully a framework using Proton) needs to be a module that exports a _class_ with a "handle" method.

To run the project:

    proton --webapp lib/webapp.js

You can now view your new web application at http://localhost:8000/. Run <code>proton --help</code> to see a list of options.

Using with Express
------------------

To use with <a href="http://expressjs.com/">Express</a>:

    var express = require('express'),
        app = express();
    
    app.get('/', function(request, response){
        response.send('Hello, World!');
    });
    
    module.exports = function () { this.handle = app };

To run in development:

    proton --webapp lib/webapp.js --reload

Using with Micro
----------------

<a href="https://github.com/usenode/micro.js">Micro</a> is a really minimal micro framework from the creators of Proton:

    var Webapp = module.exports = require('micro').webapp(__dirname),
        get = Webapp.get;
    
    get('/', function(request, response){
        response.writeHead(200, { 'Content-Type': 'text/plain' });
        response.end('Hello, World!');
    });

Why this API?
=============

Proton is a little opinionated in that it forces you to export a class of webapps rather than a webapp object. While on the face of it just having an object would be simpler, it does this to encourage the ability create instances of the webapp for testing, including the ability to do dependency injection (small d, small i). For example with Micro:

    var Webapp = module.exports = require('micro').webapp(__dirname),
        dep = require('some-dependency'),
        get = Webapp.get;
    
    // see also Webapp.prototype.init
    Webapp.prototype.someDep = function () {
        if (! this._someDep) {
            this._someDep = new dep;
        }
        return this._someDep;
    };

    Webapp.prototype.setSomeDep = function (someDep) {
        this._someDep = someDep;
    };
    
    get('/', function(request, response){
        response.writeHead(200, { 'Content-Type': 'text/plain' });
        response.end('Hello, World!');
    });

This makes it possible to exercise your webapp while mocking out the dependency.

Installation
============

NPM is recommended for development, although for production you might want to find/build a package for your operating system:

    npm install proton

