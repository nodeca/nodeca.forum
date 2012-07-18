"use strict";


// nodeca
var NLib = require('nlib');

module.exports = NLib.Application.create({
  root: __dirname,
  name: 'nodeca.forum',
  bootstrap: function (nodeca, callback) {
    // empty bootstrap... for now..
    callback();
  }
});


//
// Register global filters.
// - cache prefetch (on forum.*)
//

require('./lib/filters');
