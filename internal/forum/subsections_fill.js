// Fill subsections data in response for forum.index & forum.section
//
'use strict';


var _         = require('lodash');
var async     = require('async');
var memoizee  = require('memoizee');


var subsections_fields = [
  '_id',
  'hid',
  'title',
  'parent',
  'description',
  'moderators',
  'cache',
  'cache_hb'
];


////////////////////////////////////////////////////////////////////////////////


module.exports = function (N, apiPath) {

  /*
   * filterVisibility(s_ids, g_ids, callback)
   * - s_ids (array) - subsections ids to filter by access permissions
   * - g_ids (array) - current user groups ids
   *
   * Returns  hash { _id: Boolean(visibility) } for selected subsections
   */
  var filterVisibility = memoizee(
    function (s_ids, g_ids, callback) {
      var result = {};
      async.forEach(s_ids, function (_id, next) {
        var params = { section_id: _id, usergroup_ids: g_ids };

        N.settings.get(['forum_can_view'], params, function (err, data) {
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
      primitive:  true   // keys are calculated as toStrings, ok for our case
    }
  );

  /*
   *  to_tree(source[, root = null]) -> array
   *  - source (array): array of sections
   *  - root (mongodb.BSONPure.ObjectID|String): root section _id or null
   *
   *  Build sections tree (nested) from flat sorted array.
   */
  function to_tree(source, root) {
    var result = [];
    var nodes = {};

    source.forEach(function (node) {
      node.child_list = [];
      nodes[node._id] = node;
    });

    root = !!root ? root.toString() : null;

    // set children links for all nodes
    // and collect root children to result array
    source.forEach(function (node) {
      node.parent = !!node.parent ? node.parent.toString() : null;

      if (node.parent === root) {
        result.push(node);

      } else if (node.parent !== null) {
        // Parent can be missed, if invisible. Check it, prior to add childs.
        if (nodes[node.parent]) {
          nodes[node.parent].child_list.push(node);
        }
      }
    });

    return result;
  }

  //////////////////////////////////////////////////////////////////////////////


  // Get subsections tree in flat style (id, level) & filter visibility
  //
  N.wire.before(apiPath, function fetch_subsections_tree_info(env, callback) {

    env.extras.puncher.start('fill subsections'); // closed in the last handler
    env.extras.puncher.start('fill subsections tree structure');

    // We need to show 3 levels [0,1,2] for index, 2 levels [0,1] for section
    N.models.forum.Section.getChildren(env.data.section ? env.data.section._id : null,
      env.data.section ? 2 : 3, function (err, subsections) {

      if (err) {
        callback(err);
        return;
      }

      env.extras.puncher.stop({ count: subsections.length });
      env.extras.puncher.start('filter subsections visibility');

      // sections order is always fixed, no needs to sort.
      var s_ids = subsections.map(function (s) { return s._id.toString(); });

      // groups should be sorted, to avoid cache duplication
      var g_ids = env.extras.settings.params.usergroup_ids.map(function (g) { return g.toString(); }).sort();

      filterVisibility(s_ids, g_ids, function (err, visibility) {
        if (err) {
          callback(err);
          return;
        }

        env.data.subsections_info = _.filter(subsections, function (s) { return visibility[s._id]; });
        env.extras.puncher.stop({ count: env.data.subsections_info.length });
        callback(err);
      });
    });
  });

  // Fetch subsections data and add `level` property
  //
  N.wire.on(apiPath, function subsections_fetch_visible(env, callback) {
    var _ids = env.data.subsections_info.map(function (s) { return s._id; });
    env.data.subsections = [];

    N.models.forum.Section
      .find({ _id: { $in: _ids }})
      .select(subsections_fields.join(' '))
      .lean(true)
      .exec(function (err, sections) {

        // sort result in the same order as ids
        _.forEach(env.data.subsections_info, function(subsectionInfo) {
          var foundSection = _.find(sections, function(section) {
            return section._id.equals(subsectionInfo._id);
          });
          foundSection.level = subsectionInfo.level;
          env.data.subsections.push(foundSection);
        });

        env.extras.puncher.stop({ count: env.data.subsections.length });
        callback(err);
      });
  });

  // Sanitize subsections
  //
  N.wire.after(apiPath, function sanitize(env) {
    env.extras.settings.fetch(['can_see_hellbanned'], function (err, settings) {

      var sanitize = N.models.forum.Section.sanitize;
      env.data.subsections.forEach(function (doc) {
        sanitize(doc, {
          keep_data: env.user_info.hb || settings.can_see_hellbanned
        });
      });
    });
  });

  // Fill response data
  //
  N.wire.after(apiPath, function subsections_fill_response(env) {

    env.extras.puncher.start('fill response data');

    env.data.users = env.data.users || [];

    // collect users from subsections
    env.data.subsections.forEach(function (doc) {
      // queue moderators only for second level on index page and for first level on section page
      if (doc.level === (env.data.section ? 0 : 1)) {
        if (!!doc.moderators) {
          doc.moderators.forEach(function (user) {
            env.data.users.push(user);
          });
        }
        if (doc.cache.last_user) {
          env.data.users.push(doc.cache.last_user);
        }
      }
    });

    // Collect users/moderators from subsections. Only first & second levels required
    // Calculate deepness limit, depending on `forum index` or `forum.section`
    var max_subsection_level = Number((env.data.section || {}).level) + 2;

    env.data.subsections.forEach(function (doc) {
      // queue users only for first 2 levels (those are not displayed on level 3)
      if (doc.level < max_subsection_level) {
        if (!!doc.moderators) {
          doc.moderators.forEach(function (user) {
            env.data.users.push(user);
          });
        }
        if (doc.cache.last_user) {
          env.data.users.push(doc.cache.last_user);
        }
      }
    });

    // build response tree
    var root = (env.data.section || {})._id || null;
    env.res.subsections = to_tree(env.data.subsections, root);

    env.extras.puncher.stop();
    env.extras.puncher.stop(); // close first scope
  });
};