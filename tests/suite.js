
var litmus = require('litmus');

exports.test = new litmus.Suite('proton test suite', [
    require('./basic').test
]);

