'use strict';


/*global nodeca*/


var async = require('nlib').Vendor.Async;


function fetch(permissions, sections, usergroup_ids, callback) {
  var results = {};

  console.log(1);

  async.forEach(sections, function (forum_id, next) {
    var params = { forum_id: forum_id, usergroup_ids: usergroup_ids };

    nodeca.settings.get(permissions, params, function (err, data) {
      results[forum_id] = data;
      next(err);
    });
  }, function (err) {
    callback(err, results);
  });
}


var fetchCached = nodeca.components.memoizee(fetch, {
  // memoizee options. revalidate cache after 30 sec
  async:  true,
  maxAge: 30000
});


/**
 *  $fetchSectionsPermissions(permissions, sections, usergroups, callback) -> Void
 *  - permissions (Array of Strings)
 *  - sections (Array of Strings)
 *  - usergroups (Array of Strings)
 **/
module.exports = function (permissions, sections, usergroups, callback) {
  var s_ids = sections.map(function (s) { return String(s); }).sort();
  var g_ids = usergroups.map(function (g) { return String(g); }).sort();

  fetchCached(permissions.sort(), s_ids, g_ids, callback);
};
