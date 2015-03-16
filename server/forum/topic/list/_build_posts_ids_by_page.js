// Reflection helper:
//
// 1. Bulds IDs of posts to fetch for current page
// 2. Creates pagination info
//
// In:
//
// - env.data.posts_visible_statuses - list of statuses, allowed to view
// - env.data.topic
//
// Out:
//
// - env.data.posts_ids
// - env.data.page
//
// Used in:
//
// - `forum/topic/topic.js`
// - `forum/topic/list/by_page.js`
//
'use strict';


var _ = require('lodash');


module.exports = function (N) {

  // Shortcut
  var Post = N.models.forum.Post;

  return function buildPostIds(env, callback) {

    env.extras.settings.fetch('posts_per_page', function (err, posts_per_page) {
      if (err) {
        callback(err);
        return;
      }

      // Posts with this statuses are counted on page (others are shown, but not counted)
      var countable_statuses = [ Post.statuses.VISIBLE ];

      // For hellbanned users - count hellbanned posts too
      if (env.data.posts_visible_statuses.indexOf(Post.statuses.HB) !== -1) {
        countable_statuses.push(Post.statuses.HB);
      }

      // Page numbers starts from 1, not from 0
      var page_max      = Math.ceil(env.data.topic.cache.post_count / posts_per_page) || 1;
      var page_current  = parseInt(env.params.page, 10);

      // Create page info
      env.res.page = env.data.page = {
        current: page_current,
        max: page_max
      };

      // Algorythm:
      //
      // - calculate range for countable posts
      // - select visible posts (ids) in this range

      Post.find()
          .where('topic').equals(env.data.topic._id)
          .where('st').in(countable_statuses)
          .select('_id')
          .sort('_id')
          .skip((page_current - 1) * posts_per_page) // start offset
          .limit(posts_per_page + 1) // fetch +1 post more, to detect next page
          .lean(true)
          .exec(function (err, countable) {

        if (err) {
          callback(err);
          return;
        }

        if (countable.length === 0) {
          env.data.posts_ids = [];
          callback();
          return;
        }

        var query = Post.find()
                        .where('topic').equals(env.data.topic._id)
                        .where('st').in(env.data.posts_visible_statuses)
                        .where('_id').gte(countable[0]._id); // Set start limit

        // Set last limit. Need to cut last post, but NOT at last page
        if (page_current < page_max) {
          query.lt(countable[countable.length - 1]._id);
        }

        query
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
    });
  };
};
