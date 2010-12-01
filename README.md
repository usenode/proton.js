Introduction
============

Proton is a micro framework targetted at micro frameworks. It provides a common way for micro-frameworks to interoporate with the environment that runs them.

Examples
========

Writing a Web Appliction
------------------------

You could use it to create a web appliction (say in lib/webapp.js):

    var proton = require('proton');
    
    var WebApp = proton.framework(function () {
         // initialise the webapp here
    });
    
    WebApp.prototype.handle = function (request) {
        return {
            status  : 200,
            headers : { 'Content-Type' : 'text/plain' },
            body    : [ "Hello, World\n" ]
        };
    };
    
    exports.webapp = function () {
        return new WebApp();
    };

Notice that the "webapp" export is a factory that produces Web Apps. This means that you can always create more than one instance of a web application written with Proton (e.g. for testing).

To run the project:

    proton lib/webapp.js --port 8080

Hmmm, maybe there's a reason "proton.framework" isn't called "proton.webapp"...

Writing a Web Framework
-----------------------

However, on its own Proton isn't very useful for building webapps - it is just a very minimal layer on top of JSGI and node.http. The real power comes when you build (or use) a micro framework on top of Proton (say in lib/framework.js):

    var proton = require('proton');
    
    var WebApp = proton.framework(function (content) {
         this.content = content;
    });
    
    WebApp.prototype.handle = function (request) {
        return {
            status  : 200,
            headers : { 'Content-Type' : 'text/plain' },
            body    : [ this.content[ request.pathInfo ] ]
        };
    };
    
    exports.webapp = function (content) {
        return function () {
            return new WebApp(content);
        };
    };

Here, the exported "webapp" function is a factory that returns factories that produce Web Apps. Somebody using this framework can now use this to create the expected factory that returns Web Apps as above.

Users of your new micro framework can then use it like so (say in lib/framework-webapp.js):

    var myAmazingFramework = require("./framework");
    
    exports.webapp = myAmazingFramework.webapp({
        '/' : 'Hello, World'
    });

To run it:

    proton lib/framework-webapp.js --port 8080

Writing a useful micro framework (unlike this one) is left as an exercise for the reader.

API
===

proton.run(webapp, options object?)
-----------------------------------

The webapp should be a web appliction instance - i.e. the instance of a class (/prototype, whatever) created with "proton.framework". The following options are supported:

 * port    - the port to bind to (default 80)
 * bind    - the ip address to bind to (default '0.0.0.0')
 * urlBase - the root of the url space that the webapp should respond to (default '/')

proton.framework(function)
--------------------------

This method takes a constructor function that can be used as prototype for new web application objects, which it returns after making sure that it can be called with or without "new" and making it add a web application context when a web appliction is instantiated (it actually creates a kind of subclass of your constructor function). This web appliction context object can  be accessed via the "context" property on the web appliction object, described below.

WebAppContext (this.context in a method on a web appliction)
------------------------------------------------------------

Proton based frameworks have access to an object that represents the context that the web appliction runs in. This is exposed as a "context" property on the instance of the prototype you pass to "proton.framework":

    var WebApp = proton.framework(function () {
        // someMethod doesn't actually exist, the real methods are descibed below
        this.context.someMethod();
    });

    WebApp.prototype.handle = function () {
        // this.context is available here, as well as in other methods on WebApp
    };

### this.context.beforeStart(promise)

The before start takes a promise object (Promised.IO recommended) representing an asynchronous operation that should complete before the server is started (as a result of proton.run being called).

Installation
============

NPM is recommended for development, although for production you might want to find/build a package for your operating system:

    npm install proton

(TODO does not work yet)

Future Work
===========

The "proton.framework" function and web appliction context object are the only interfaces that Proton exposes to a framework and expects from a framework (you can also expose proton.run to your users where they start their server manually, but this probably isn't that useful for production deployment). Future development of Proton is likely to provide features to environments that want to run Proton based frameworks and the web applictions based on them, maintaining a stable interface for web application frameworks.

This work is likely to include the following:

* A script to run web applictions built on Proton frameworks (for development).
* An easy way to create services that run web applictions built on Proton frameworks (for deployment).

The latter should include the ability to:

* Daemonise the server.
* Dropping root privileges (require to bind to port 80).
* Add JSGI middleware.
* etc.

The nice thing about this approach (and that of JSGI) is that these bits can all be separated from the web appliction frameworks and web applications themselves.

See Also
========

* Proton based (micro) frameworks
* JSGI
* Promised.IO
* Node.JS
* NPM
