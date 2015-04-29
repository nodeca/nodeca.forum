// Reflection helper for `internal:forum.topic_list`:
//
// 1. Builds IDs of topics to fetch for current page
// 2. Creates pagination info
//
// In:
//
// - env.user_info.hb
// - env.data.section
// - env.params.last_post_id
// - env.params.before
// - env.params.after
// - env.data.topics_visible_statuses - list of statuses, allowed to view
//
// Out:
//
// - env.data.topics_ids
//
// Needed in:
//
// - `forum/section/list/by_range.js`
//
'use strict';


var _     = require('lodash');
var async = require('async');


module.exports = function (N) {

  // Shortcut
  var Topic = N.models.forum.Topic;

  return function buildTopicIds(env, callback) {
    var range = [ env.params.last_post_id, env.params.last_post_id ];
    var lookup_key = env.user_info.hb ? 'cache_hb.last_post' : 'cache.last_post';

    function select_visible_before(callback) {
      var count = env.params.before;
      if (count <= 0) {
        callback(null, []);
        return;
      }

      var sort = {};
      sort[lookup_key] = 1;

      Topic.find()
          .where('section').equals(env.data.section._id)
          .where(lookup_key).gt(env.params.last_post_id)
          .where('st').in(_.without(env.data.topics_visible_statuses, Topic.statuses.PINNED))
          .select('_id')
          .sort(sort)
          .limit(count)
          .lean(true)
          .exec(function (err, topics) {

        if (err) {
          callback(err);
          return;
        }

        callback(null, _.pluck(topics, '_id').reverse());
      });
    }

    function select_visible_after(callback) {
      var count = env.params.after;
      if (count <= 0) {
        callback(null, []);
        return;
      }

      var sort = {};
      sort[lookup_key] = -1;

      Topic.find()
          .where('section').equals(env.data.section._id)
          .where(lookup_key).lt(env.params.last_post_id)
          .where('st').in(_.without(env.data.topics_visible_statuses, Topic.statuses.PINNED))
          .select('_id')
          .sort(sort)
          .limit(count)
          .lean(true)
          .exec(function (err, topics) {

        if (err) {
          callback(err);
          return;
        }

        callback(null, _.pluck(topics, '_id'));
      });
    }

    async.parallel([ select_visible_before, select_visible_after ], function (err, results) {
      if (err) {
        callback(err);
        return;
      }

      env.data.topics_ids = Array.prototype.concat.apply([], results);

      // Add pinned topics if we're reached start of the section
      //
      // Start is determined by the amount of topics we get from the database:
      // if there are less topics in the result than requested, we're there.
      //
      if (results[0].length >= env.params.before) {
        callback();
        return;
      }

      var sort = {};
      sort[lookup_key] = -1;

      Topic.find()
          .where('section').equals(env.data.section._id)
          .where('st').equals(Topic.statuses.PINNED)
          .select('_id')
          .sort(sort)
          .lean(true)
          .exec(function (err, topics) {

        if (err) {
          callback(err);
          return;
        }

        // Put pinned topics IDs to start of `env.data.topics_ids`
        env.data.topics_ids = _.pluck(topics, '_id').concat(env.data.topics_ids);
        callback();
      });
    });
  };
};
