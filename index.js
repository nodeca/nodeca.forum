"use strict";

exports.root = __dirname;
exports.name = 'nodeca.forum';
exports.init = function (N) { require('./lib/autoload.js')(N); };
