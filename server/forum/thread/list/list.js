// Fetch pure posts data. Used:
// - from thread page, as sub-request
// - from ajax, to "append next page"
//
"use strict";


var _  = require('lodash');

// collections fields filters
var fields = require('./_fields.js');

module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    // thread id
    id: {
      type: "integer",
      minimum: 1,
      required: true
    },
    page: {
      type: "integer",
      minimum: 1,
      'default': 1
    }
  });


  // shortcuts
  var Thread = N.models.forum.Thread;
  var Post = N.models.forum.Post;


  // fetch thread info & check that thread exists
  N.wire.before(apiPath, function fetch_thread_info(env, callback) {

    // If thread already fetched (in parent request, for example),
    // skip this step.
    if (env.thread) {
      callback();
      return;
    }

    env.extras.puncher.start('Thread info prefetch');

    Thread.findOne({ id: env.params.id }).setOptions({ lean: true })
        .exec(function (err, thread) {

      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      // No thread -> "Not Found" status
      if (!thread) {

        // FIXME Redirect to last page if possible

        callback(N.io.NOT_FOUND);
        return;
      }

      env.data.thread = thread;
      callback();
    });
  });


  // check access permissions
  N.wire.before(apiPath, function check_permissions(env, callback) {

    env.extras.settings.params.forum_id = env.data.thread.forum;
    env.extras.puncher.start('Fetch settings');

    env.extras.settings.fetch(['forum_show', 'forum_read_topics'], function (err, settings) {
      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      if (!settings.forum_show) {
        callback(N.io.NOT_AUTHORIZED);
        return;
      }

      if (!settings.forum_read_topics) {
        callback(N.io.NOT_AUTHORIZED);
        return;
      }

      callback();
    });
  });


  // fetch posts per page setting
  N.wire.before(apiPath, function check_and_set_page_info(env, callback) {
    env.extras.puncher.start('Fetch posts per page setting');

    env.extras.settings.fetch(['posts_per_page'], function (err, settings) {
      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      env.data.posts_per_page = settings.posts_per_page;
      callback();
    });
  });


  // fetch and prepare posts
  //
  // ##### params
  //
  // - `id`         thread id
  // - `page`       page number
  //
  N.wire.on(apiPath, function (env, callback) {
    var start;
    var query;

    var posts_per_page = env.data.posts_per_page;

    env.extras.puncher.start('Get posts');
    env.extras.puncher.start('Post ids prefetch');


    // FIXME add state condition to select only visible posts

    start = (env.params.page - 1) * posts_per_page;

    // Unlike threads list, we can use simplified fetch,
    // because posts are always ordered by id - no need to sort by timestamp
    Post.find({ thread_id: env.params.id }).select('_id').sort('ts').skip(start)
        .limit(posts_per_page + 1).setOptions({ lean: true }).exec(function (err, docs) {

      env.extras.puncher.stop(!!docs ? { count: docs.length } : null);

      if (err) {
        callback(err);
        return;
      }

      // No page -> "Not Found" status
      if (!docs.length) {
        // When user requests page that is out of possible range we redirect
        // them during before filter (see above).
        //
        // But very rarely, cached posts counter can be out of sync.
        // In this case return 404 for empty result.
        callback(N.io.NOT_FOUND);
        return;
      }

      env.extras.puncher.start('Get posts by _id list');

      // FIXME modify state condition (deleted and etc) if user has permission
      // If no hidden posts - no conditions needed, just select by IDs

      query = Post.find({ thread_id: env.params.id }).where('_id').gte(_.first(docs)._id);
      if (docs.length <= posts_per_page) {
        query.lte(_.last(docs)._id);
      }
      else {
        query.lt(_.last(docs)._id);
      }

      query.select(fields.post_in.join(' ')).setOptions({ lean: true })
          .exec(function (err, posts) {

        env.extras.puncher.stop(!!posts ? { count: posts.length } : null);
        env.extras.puncher.stop();

        if (err) {
          callback(err);
          return;
        }

        env.data.posts = posts;
        callback();
      });
    });

  });


  // Build response:
  //  - posts list -> posts
  //  - collect users ids
  //
  N.wire.after(apiPath, function build_posts_list_and_users(env, callback) {
    var posts;

    env.extras.puncher.start('Post-process posts/users');

    posts = env.response.data.posts = env.data.posts;

    env.data.users = env.data.users || [];

    // collect users
    posts.forEach(function (post) {
      if (post.user) {
        env.data.users.push(post.user);
      }
    });

    env.response.data.users = env.data.users;

    env.extras.puncher.stop();

    callback();
  });

};
