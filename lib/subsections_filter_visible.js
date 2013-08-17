// Filters env.data.subsections, according to
// visibility permissions for current user

'use strict';


var _         = require('lodash');
var async     = require('async');
var memoizee  = require('memoizee');

var _N;

var fetchVisibility = memoizee(
  function (s_ids, g_ids, callback) {
    var result = {};
    async.forEach(s_ids, function (_id, next) {
      var params = { section_id: _id, usergroup_ids: g_ids };

      _N.settings.get(['forum_can_view'], params, function (err, data) {
        result[_id] = data.forum_can_view;
        next(err);
      });
    }, function (err) {
      callback(err, result);
    });
  },
  {
    async:      true,
    maxAge:     60000, // cache TTL = 60 seconds
    primitive:  true   // params keys are calculated as toStrings, ok for our case
  }
);


/*
 *  $fetchSectionsPermissions(permissions, sections, usergroups, callback) -> Void
 *  - sections (Array): List of sections ids or mongoose models
 *  - usergroups (Array): List of usergroup ids or mongoose models
 */
module.exports = function (N, env, callback) {
  _N = _N || N;

  if (_.isEmpty(env.data.subsections)) {
    callback();
    return;
  }

  // sections order is always fixed, no needs to sort.
  var s_ids = env.data.subsections.map(function (s) { return s._id.toString(); });

  // groups should be sorted, to avoid cache duplication
  var g_ids = env.extras.settings.params.usergroup_ids.map(function (g) { return g.toString(); }).sort();

  env.extras.puncher.start('Fetch subsections visibility');

  fetchVisibility(s_ids, g_ids, function (err, visibility) {
    env.extras.puncher.stop({ count: visibility.length });

    if (err) {
      callback(err);
      return;
    }

    env.data.subsections = _.filter(env.data.subsections, function (s) { return visibility[s._id]; });
    callback(err);
  });
};
