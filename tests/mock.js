
var Webapp = module.exports = function () {
    this.events = ['instantiated'];
};
    
Webapp.prototype.handle = function (request, response) {
    this.events.push('handle called for ' + request + ' ' + response);
};

Webapp.prototype.onBeforeStart = function (done) {
    var webapp = this;
    this.events.push('onBeforeStart called');
    setTimeout(function () {
        webapp.events.push('onBeforeStart running...');
        done.resolve();
    }, 30);
};

