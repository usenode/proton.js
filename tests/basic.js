
var litmus = require('litmus'),
    proton = require('..');

exports.test = new litmus.Test('basic proton tests', function () {
    var test = this;

    test.plan(1);

    test.is(typeof proton, 'object', 'proton namespace is an object');
});
