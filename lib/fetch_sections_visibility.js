'use strict';


/*global nodeca*/


var async = require('nlib').Vendor.Async;


function fetch(sections, usergroup_ids, callback) {
  var results = {};

  async.forEach(sections, function (forum_id, next) {
    var params = { forum_id: forum_id, usergroup_ids: usergroup_ids };

    nodeca.settings.get(['forum_show'], params, function (err, data) {
      results[forum_id] = data;
      next(err);
    });
  }, function (err) {
    callback(err, results);
  });
}


var fetchCached = nodeca.components.memoizee(fetch, {
  // memoizee options. revalidate cache after 30 sec
  async:      true,
  maxAge:     30000,
  primitive:  true
});


/**
 *  $fetchSectionsPermissions(permissions, sections, usergroups, callback) -> Void
 *  - sections (Array): List of sections ids or mongoose models
 *  - usergroups (Array): List of usergroup ids or mongoose models
 **/
module.exports = function (sections, usergroups, callback) {
  var s_ids = sections.map(function (s) { return String(s); }).sort();
  var g_ids = usergroups.map(function (g) { return String(g); }).sort();

  fetchCached(s_ids, g_ids, callback);
};
