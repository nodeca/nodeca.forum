// Fill subsections data in response for forum.index & forum.section
//
"use strict";


var _         = require('lodash');
var async     = require('async');
var memoizee  = require('memoizee');

var API_PATH  = 'internal:forum.subsections_fill';


var subsections_fields = [
  '_id',
  'hid',
  'title',
  'description',
  'moderators',
  'child_list',
  'cache'
];


////////////////////////////////////////////////////////////////////////////////


module.exports = function (N) {

  function fetchSubsections(root, callback) {
    var query;

    if (root) {
      // forum.section subtree
      query = N.models.forum.Section
        .find({ parent_list: root._id })
        .where('level').lte(root.level + 2);
    } else {
      // root subtree
      query = N.models.forum.Section
        .find()
        .where('level').lte(2);
    }

    query
      .sort('display_order')
      .setOptions({ lean: true })
      .exec(callback);
  }

  /*
   * fetchVisibility(s_ids, g_ids, callback)
   * - s_ids (array) - subsections ids to filter by access permissions
   * - g_ids (array) - current user groups ids
   *
   * Returns  hash { _id: Boolean(visibility) } for selected subsections
   */
  var fetchVisibility = memoizee(
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


  // Fetch raw subsections data & filter visibility
  //
  N.wire.on(API_PATH, function subsections_fetch_visible(env, callback) {

    env.extras.puncher.start('fill subsections'); // closed in the last handler

    env.extras.puncher.start('fetch subsections data');

    fetchSubsections(env.data.section, function (err, subsections) {
      if (err) {
        callback(err);
        return;
      }

      env.extras.puncher.stop({ count: subsections.length });
      env.extras.puncher.start('fetch subsections visibility');

      // sections order is always fixed, no needs to sort.
      var s_ids = subsections.map(function (s) { return s._id.toString(); });

      // groups should be sorted, to avoid cache duplication
      var g_ids = env.extras.settings.params.usergroup_ids.map(function (g) { return g.toString(); }).sort();

      fetchVisibility(s_ids, g_ids, function (err, visibility) {
        if (err) {
          callback(err);
          return;
        }

        env.data.subsections = _.filter(subsections, function (s) { return visibility[s._id]; });
        env.extras.puncher.stop({ count: env.data.subsections.length });

        callback(err);
      });
    });
  });


  // Fill response data
  //
  N.wire.after(API_PATH, function subsections_fill_response(env) {

    env.extras.puncher.start('fill response data');

    env.data.users = env.data.users || [];

    // collect users from subsections
    env.data.subsections.forEach(function (doc) {
      // queue users only for first 2 levels (those are not displayed on level 3)
      if (doc.level < 2) {
        if (!!doc.moderators) {
          doc.moderators.forEach(function (user) {
            env.data.users.push(user);
          });
        }
        if (doc.cache.real.last_user) {
          env.data.users.push(doc.cache.real.last_user);
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
        if (doc.cache.real.last_user) {
          env.data.users.push(doc.cache.real.last_user);
        }
      }
    });

    // build response tree
    var root = (env.data.section || {})._id || null;
    env.res.subsections = to_tree(env.data.subsections, root);

    // Cleanup output tree - delete attributes, that are not in white list.
    // Since tree points to the same objects, that are in flat list,
    // we use flat array for iteration.
    env.data.subsections.forEach(function (doc) {
      Object.keys(doc).forEach(function(attr) {
        if (subsections_fields.indexOf(attr) === -1) { delete doc[attr]; }
      });
      delete (doc.cache.hb);
    });

    env.extras.puncher.stop();
    env.extras.puncher.stop(); // close first scope
  });
};