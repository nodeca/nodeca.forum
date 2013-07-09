// Show posts list (thread)
//
"use strict";


var _     = require('lodash');


var forum_breadcrumbs = require('../../lib/forum_breadcrumbs.js');


var posts_in_fields = [
  '_id',
  'id',
  'to',
  'attach_list',
  'text',
  'fmt',
  'html',
  'user',
  'ts'
];

var thread_info_out_fields = [
  '_id',
  'id',
  'forum_id',
  'title',
  '_seo_desc'
];


// settings that needs to be fetched
var settings_fetch = [
  'posts_per_page',
  'forum_show',
  'forum_read_topics',
  'forum_reply_topics'
];


// settings that would be "exposed" into views
var settings_expose = [
  'forum_read_topics',
  'forum_reply_topics'
];


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    // thread id
    id: {
      type: "integer",
      minimum: 1,
      required: true
    },
    forum_id: {
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
  var Section = N.models.forum.Section;
  var Thread = N.models.forum.Thread;
  var Post = N.models.forum.Post;


  // fetch thread and forum info to simplify permisson check
  N.wire.before(apiPath, function fetch_thread_and_forum_info(env, callback) {
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

      env.extras.puncher.start('Forum(parent) info prefetch');

      // `params.forum_id` can be wrong (old link to moved thread)
      // Use real id from fetched thread
      Section.findOne({ _id: thread.forum }).setOptions({ lean: true })
          .exec(function (err, forum) {

        env.extras.puncher.stop();

        if (err) {
          callback(err);
          return;
        }

        // No forum -> thread with missed parent, return "Not Found" too
        if (!forum) {
          callback(N.io.NOT_FOUND);
          return;
        }

        // If params.forum_id defined, and not correct - redirect to proper location
        if (env.params.forum_id && (forum.id !== +env.params.forum_id)) {
          callback({
            code: N.io.REDIRECT,
            head: {
              'Location': N.runtime.router.linkTo('forum.section', {
                id:       thread.id,
                forum_id: forum.id,
                page:     env.params.page || 1
              })
            }
          });
          return;
        }

        env.data.section = forum;
        callback();
      });
    });
  });


  N.wire.before(apiPath, function thread_get_settings(env, callback) {
    env.extras.settings.params.forum_id = env.data.thread.forum;
    env.extras.puncher.start('Fetch settings');

    env.extras.settings.fetch(settings_fetch, function (err, settings) {
      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      // propose all settings to data
      env.data.settings = settings;

      // propose settings for views to response.data
      env.response.data.settings = _.pick(settings, settings_expose);

      callback();
    });
  });


  N.wire.before(apiPath, function fetch_thread_and_forum_info(env, callback) {

    if (!env.data.settings.forum_show) {
      callback(N.io.NOT_AUTHORIZED);
      return;
    }

    if (!env.data.settings.forum_read_topics) {
      callback(N.io.NOT_AUTHORIZED);
      return;
    }

    callback();

  });


  // presets pagination data and redirects to the last page if
  // requested page is bigger than max available
  //
  N.wire.before(apiPath, function check_and_set_page_info(env, callback) {
    var per_page = env.data.settings.posts_per_page,
        max      = Math.ceil(env.data.thread.cache.real.post_count / per_page),
        current  = parseInt(env.params.page, 10);

    if (current > max) {
      // Requested page is BIGGER than maximum - redirect to the last one
      callback({
        code: N.io.REDIRECT,
        head: {
          "Location": N.runtime.router.linkTo('forum.thread', {
            forum_id: env.params.forum_id,
            id:       env.params.id,
            page:     max
          })
        }
      });
      return;
    }

    // requested page is OK. propose data for pagination
    env.response.data.page = { max: max, current: current };
    callback();
  });


  // fetch and prepare posts
  //
  // ##### params
  //
  // - `id`         thread id
  // - `forum_id`   forum id
  //
  N.wire.on(apiPath, function (env, callback) {
    var start;
    var query;

    var posts_per_page = env.data.settings.posts_per_page;

    env.response.data.show_page_number = false;

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

      query.select(posts_in_fields.join(' ')).setOptions({ lean: true })
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


  // Fill head meta & fetch/fill breadcrumbs
  //
  N.wire.after(apiPath, function fill_head_and_breadcrumbs(env, callback) {
    var t_params;
    var query;
    var fields;
    var data = env.response.data;
    var thread = env.data.thread;
    var forum = env.data.section;

    if (env.session && env.session.hb) {
      thread.cache.real = thread.cache.hb;
    }

    // prepare page title
    data.head.title = thread.title;
    if (env.params.page > 1) {
      t_params = { title: thread.title, page: env.params.page };
      data.head.title = env.t('title_with_page', t_params);
    }

    // prepare thread info
    data.thread = _.pick(thread, thread_info_out_fields);

    // build breadcrumbs
    query = { _id: { $in: forum.parent_list }};
    fields = { '_id': 1, 'id': 1, 'title': 1 };

    env.extras.puncher.start('Build breadcrumbs');

    Section.find(query).select(fields).sort({ 'level': 1 })
        .setOptions({ lean: true }).exec(function (err, parents) {

      if (err) {
        env.extras.puncher.stop();
        callback(err);
        return;
      }

      parents.push(forum);
      data.blocks = data.blocks || {};
      data.blocks.breadcrumbs = forum_breadcrumbs(env, parents);

      env.extras.puncher.stop();

      callback();
    });

  });
};
