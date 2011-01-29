Introduction
============

Proton is a micro framework targetted at micro frameworks. It provides a common way for micro-frameworks to interoporate with the environment that runs them.

Examples
========

Writing a Web Appliction
------------------------

You could use it to create a web appliction (say in lib/webapp.js), which is simply a class (insomuch that anything is a class in JavaScript) that is instantiated by Proton and has its handle method invoked for each HTTP request:

    var proton = require('proton');
    
    var WebApp = exports.WebApp = function () {
         // initialise the webapp here
    };
    
    WebApp.prototype.handle = function (request) {
        return {
            status  : 200,
            headers : { 'Content-Type' : 'text/plain' },
            body    : [ "Hello, World\n" ]
        };
    };
    
Each web application built on Proton (or hopefully a framework using Proton) needs to be a module that exports <code>WebApp</code> (i.e. assigns the prototype function to <code>exports.WebApp</code>). The return value from the <code>handle</code> method should be that expected for a <a href="http://wiki.commonjs.org/wiki/JSGI/Level0/A/Draft2">JSGI</a> application.

To run the project:

    proton --webapp lib/webapp.js

You can now view your new web application at http://localhost:8000/. Run <code>proton --help</code> to see a list of options.

Writing a Web Framework
-----------------------

Proton on its own isn't very useful for building webapps - it is just a very minimal layer on top of JSGI and node.http. The real power comes when you build (or use) a micro framework on top of Proton (say in lib/framework.js):

    var proton = require('proton');
    
    exports.webapp = function (content) {
        var WebApp = function () {};
        
        WebApp.prototype.handle = function (request) {
            return {
                status  : 200,
                headers : { 'Content-Type' : 'text/plain' },
                body    : [ this.content[ request.pathInfo ] ]
            };
        };
        
        return WebApp;
    };

Here, the exported "webapp" function is a factory that returns prototypes for web applications (i.e. the classes that Proton expects). Somebody using this framework can now use this to create a web application class like so:

    var myAmazingFramework = require("./framework");
    
    exports.WebApp = myAmazingFramework.webapp({
        '/' : 'Hello, World'
    });

To run it:

    proton lib/framework-webapp.js --webapp lib/mywebapp.js

Writing a useful micro framework (unlike this one) is left as an exercise for the reader.

API
===

### proton.beforeStart(WebApp, promise)

The before start takes a web application class and a promise object (Promised.IO recommended) representing an asynchronous operation that should complete before the server for that web application is started. This will be applied for all instances of that web application.

Installation
============

NPM is recommended for development, although for production you might want to find/build a package for your operating system:

    npm install proton

Future Work
===========

Future development of Proton is likely to provide features to environments that want to run Proton based frameworks and the web applictions based on them, maintaining a stable interface for web application frameworks.

This work is likely to include the following:

* Automatically reload code during development.
* An easy way to create services that run web applictions built on Proton frameworks (for deployment).
* Ability to add JSGI middleware.
* Ability to instantiate web applications for unit and integration testing.
* etc.

The nice thing about this approach (and that of JSGI) is that these bits can all be separated from the web appliction frameworks and web applications themselves.

See Also
========

* Proton based (micro) frameworks
* JSGI
* Promised.IO
* Node.JS
* NPM
