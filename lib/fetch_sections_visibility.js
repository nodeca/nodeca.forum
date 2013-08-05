'use strict';


/*global N*/


var async     = require('async');
var memoizee  = require('memoizee');


function fetch(sections, usergroup_ids, callback) {
  var results = {};

  async.forEach(sections, function (forum_id, next) {
    var params = { forum_id: forum_id, usergroup_ids: usergroup_ids };

    N.settings.get(['forum_can_view'], params, function (err, data) {
      results[forum_id] = data;
      next(err);
    });
  }, function (err) {
    callback(err, results);
  });
}


var fetchCached = memoizee(fetch, {
  async:      true,
  maxAge:     60000, // cache TTL = 60 seconds
  primitive:  true   // params keys are calculated as toStrins, ok for out case
});


/**
 *  $fetchSectionsPermissions(permissions, sections, usergroups, callback) -> Void
 *  - sections (Array): List of sections ids or mongoose models
 *  - usergroups (Array): List of usergroup ids or mongoose models
 **/
module.exports = function (sections, usergroups, callback) {
  // sections order is always fixed, no neds to sort.
  var s_ids = sections; //.map(function (s) { return String(s); }).sort();

  // groups should be sorted, to avoid cache duplication
  var g_ids = usergroups.map(function (g) { return String(g); }).sort();

  fetchCached(s_ids, g_ids, callback);
};
