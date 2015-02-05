// Used in:
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

      var postPaginatedSt = [ Post.statuses.VISIBLE ];

      if (env.data.posts_visible_statuses.indexOf(Post.statuses.HB) !== -1) {
        postPaginatedSt.push(Post.statuses.HB);
      }

      var max = Math.ceil(env.data.topic.cache.post_count / posts_per_page) || 1;
      var current  = parseInt(env.params.page, 10);
      var start = (current - 1) * posts_per_page;

      env.res.page = env.data.page = { current: current, max: max };

      Post.find({ topic: env.data.topic._id, st: { $in: postPaginatedSt } })
          .select('_id')
          .sort('_id')
          .skip(start)
          .limit(posts_per_page + 1)
          .lean(true)
          .exec(function (err, visible_posts) {

        if (err) {
          callback(err);
          return;
        }

        if (visible_posts.length === 0) {
          env.data.posts_ids = [];
          callback();
          return;
        }

        var query = Post
                      .find()
                      .where('topic').equals(env.data.topic._id)
                      .where('st').in(env.data.posts_visible_statuses)
                      .where('_id').gte(_.first(visible_posts)._id);

        // Don't cut tail on the last page
        if (current < max) {
          query.lt(_.last(visible_posts)._id);
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
