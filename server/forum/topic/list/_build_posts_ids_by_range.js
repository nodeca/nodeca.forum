// Reflection helper for `internal:forum.post_list`:
//
// 1. Builds IDs of posts to fetch for current page
// 2. Creates pagination info
//
// In:
//
// - env.user_info.hb
// - env.data.posts_visible_statuses - list of statuses, allowed to view
// - env.data.topic
// - env.params.post_hid
// - env.params.before
// - env.params.after
//
// Out:
//
// - env.data.posts_ids
//
// Needed in:
//
// - `forum/topic/list/by_range.js`
//
'use strict';


var _     = require('lodash');
var async = require('async');


module.exports = function (N) {

  // Shortcut
  var Post = N.models.forum.Post;

  return function buildPostIds(env, callback) {
    var range = [ env.params.post_hid - 1, env.params.post_hid + 1 ];

    // Posts with this statuses are counted on page (others are shown, but not counted)
    var countable_statuses = [ Post.statuses.VISIBLE ];

    // For hellbanned users - count hellbanned posts too
    if (env.user_info.hb) {
      countable_statuses.push(Post.statuses.HB);
    }

    function select_visible_before(cb) {
      var posts_count = env.params.before;
      if (posts_count <= 0) { return cb(); }

      Post.find()
          .where('topic').equals(env.data.topic._id)
          .where('st').in(countable_statuses)
          .where('hid').lt(env.params.post_hid)
          .select('hid')
          .sort({ hid: -1 })
          .limit(posts_count + 1)
          .lean(true)
          .exec(function (err, countable) {

        if (err) { return cb(err); }

        if (countable.length) {
          range[0] = countable[countable.length - 1].hid;
        }
        if (countable.length < posts_count + 1) {
          // we reached the last post, so it should be included as well
          range[0]--;
        }

        cb();
      });
    }

    function select_visible_after(cb) {
      var posts_count = env.params.after;
      if (posts_count <= 0) { return cb(); }

      Post.find()
          .where('topic').equals(env.data.topic._id)
          .where('st').in(countable_statuses)
          .where('hid').gt(env.params.post_hid)
          .select('hid')
          .sort({ hid: 1 })
          .limit(posts_count + 1)
          .lean(true)
          .exec(function (err, countable) {

        if (err) { return cb(err); }

        if (countable.length) {
          range[1] = countable[countable.length - 1].hid;
        }
        if (countable.length < posts_count + 1) {
          // we reached the last post, so it should be included as well
          range[1]++;
        }

        cb();
      });
    }

    async.parallel([ select_visible_before, select_visible_after ], function (err) {
      if (err) {
        callback(err);
        return;
      }

      Post.find()
          .where('topic').equals(env.data.topic._id)
          .where('st').in(env.data.posts_visible_statuses)
          .where('hid').gt(range[0])
          .where('hid').lt(range[1])
          .select('_id')
          .sort('_id')
          .lean(true)
          .exec(function (err, posts) {

        if (err) {
          callback(err);
          return;
        }

        env.data.posts_ids = _.pluck(posts, '_id');
        callback();
      });
    });
  };
};
