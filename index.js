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
// Register global filters (forum && admin.forum).
// Fetch full section list, used for permission checking,
//   building breadcrumbs and etc
//

require('./lib/filters');
