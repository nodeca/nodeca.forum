// Fetch pure posts data. Used:
// - from thread page, as sub-request
// - from ajax, to "append next page"
//
"use strict";


var _  = require('lodash');

// collections fields filters
var fields = require('./_fields.js');

// thread and post statuses
var statuses = require('../_statuses.js');

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
    if (env.data.thread) {
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

      // No page -> return empty data, without trying to fetch posts
      if (!docs.length) {
        // Very rarely, user can request next page, when moderator deleted thread tail.
        env.data.posts = [];
        callback();
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


  // Add thread info
  N.wire.after(apiPath, function fill_thread_info(env) {
    env.response.data.thread = _.extend({}, env.response.data.thread, _.pick(env.data.thread, fields.thread_out));
  });

  // Sanitize response info. We should not show hellbanned status to users
  // that cannot view hellbanned content. In this case we use 'ste' status instead.
  N.wire.after(apiPath, function sanitize_statuses(env, callback) {

    env.extras.puncher.start("Fetch 'can_see_hellbanned' for statuses sanitizer");

    env.extras.settings.fetch(['can_see_hellbanned'], function (err, settings) {
      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      if (settings.can_see_hellbanned) {
        callback();
        return;
      }

      //sanitize thread statuses
      var thread = env.response.data.thread;
      if (thread.st === statuses.thread.HB) {
        thread.st = thread.ste;
        delete thread.ste;
      }

      //sanitize post statuses
      var posts = env.response.data.posts;
      posts.forEach(function (post) {
        if (post.st === statuses.thread.HB) {
          post.st = post.ste;
          delete post.ste;
        }
      });

      callback();
    });
  });

  // Add permissions, required to render posts list
  N.wire.after(apiPath, function expose_settings(env, callback) {

    env.extras.settings.params.forum_id = env.data.thread.forum;
    env.extras.puncher.start('Fetch public posts list settings');

    env.extras.settings.fetch(['forum_reply_topics'], function (err, settings) {
      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      env.response.data.settings = _.extend({}, env.response.data.settings, settings);
      callback();
    });
  });

};
