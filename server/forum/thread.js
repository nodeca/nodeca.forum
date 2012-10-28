"use strict";

/*global nodeca, _*/

var Section = nodeca.models.forum.Section;
var Thread = nodeca.models.forum.Thread;
var Post = nodeca.models.forum.Post;

var forum_breadcrumbs = require('../../lib/forum_breadcrumbs.js');

var posts_in_fields = [
  '_id',
  'id',
  'attach_list',
  'text',
  'fmt',
  'html',
  'user',
  'ts'
];

var thread_info_out_fields = [
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


// Validate input parameters
//
var params_schema = {
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
    default: 1
  }
};
nodeca.validate(params_schema);


// fetch thread and forum info to simplify permisson check
nodeca.filters.before('@', function fetch_thread_and_forum_info(params, next) {
  var env = this;

  env.extras.puncher.start('Thread info prefetch');

  Thread.findOne({ id: params.id }).setOptions({ lean: true })
      .exec(function (err, thread) {

    env.extras.puncher.stop();

    if (err) {
      next(err);
      return;
    }

    // No thread -> "Not Found" status
    if (!thread) {

      // FIXME Redirect to last page if possible

      next(nodeca.io.NOT_FOUND);
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
        next(err);
        return;
      }

      // No forum -> thread with missed parent, return "Not Found" too
      if (!forum) {
        next(nodeca.io.NOT_FOUND);
        return;
      }

      // If params.forum_id defined, and not correct - redirect to proper location
      if (params.forum_id && (forum.id !== +params.forum_id)) {
        next({
          code: nodeca.io.REDIRECT,
          head: {
            'Location': nodeca.runtime.router.linkTo('forum.section', {
              id:       thread.id,
              forum_id: forum.id,
              page:     params.page || 1
            })
          }
        });
        return;
      }

      env.data.section = forum;
      next();
    });
  });
});


nodeca.filters.before('@', function thread_get_settings(params, next) {
  var env = this;

  env.settings.params.forum_id = env.data.thread.forum;
  env.extras.puncher.start('Fetch settings');

  env.settings.fetch(settings_fetch, function (err, settings) {
    if (err) {
      next(err);
      return;
    }

    // propose all settings to data
    env.data.settings = settings;

    // propose settings for views to response.data
    env.response.data.settings = _.pick(settings, settings_expose);
    env.extras.puncher.stop();

    next();
  });
});


nodeca.filters.before('@', function thread_check_permissions(params, next) {

  if (!this.data.settings.forum_show) {
    next(nodeca.io.NOT_AUTHORIZED);
    return;
  }

  if (!this.data.settings.forum_read_topics) {
    next(nodeca.io.NOT_AUTHORIZED);
    return;
  }

  next();

});


// presets pagination data and redirects to the last page if
// requested page is bigger than max available
nodeca.filters.before('@', function check_and_set_page_info(params, next) {
  var per_page = this.data.settings.posts_per_page,
      max      = Math.ceil(this.data.thread.cache.real.post_count / per_page),
      current  = parseInt(params.page, 10);

  if (current > max) {
    // Requested page is BIGGER than maximum - redirect to the last one
    next({
      code: nodeca.io.REDIRECT,
      head: {
        "Location": nodeca.runtime.router.linkTo('forum.thread', {
          forum_id: params.forum_id,
          id:       params.id,
          page:     max
        })
      }
    });
    return;
  }

  // requested page is OK. propose data for pagination
  this.response.data.page = { max: max, current: current };
  next();
});


// fetch and prepare posts
//
// ##### params
//
// - `id`         thread id
// - `forum_id`   forum id
module.exports = function (params, next) {
  var env = this;
  var start;
  var query;

  var posts_per_page = this.data.settings.posts_per_page;

  env.response.data.show_page_number = false;

  env.extras.puncher.start('Get posts');
  env.extras.puncher.start('Post ids prefetch');


  // FIXME add state condition to select only visible posts

  start = (params.page - 1) * posts_per_page;

  Post.find({ thread_id: params.id }).select('_id').sort('ts').skip(start)
      .limit(posts_per_page + 1).setOptions({ lean: true }).exec(function (err, docs) {

    if (err) {
      next(err);
      return;
    }

    // No page -> "Not Found" status
    if (!docs.length) {
      // When user requests page that is out of possible range we redirect
      // them during before filter (see above).
      //
      // But very rarely, cached posts counter can be out of sync.
      // In this case return 404 for empty result.
      next(nodeca.io.NOT_FOUND);
      return;
    }

    env.extras.puncher.stop(!!docs ? { count: docs.length } : null);
    env.extras.puncher.start('Get posts by _id list');

    // FIXME modify state condition (deleted and etc) if user has permission
    // If no hidden posts - no conditions needed, just select by IDs

    query = Post.find({ thread_id: params.id }).where('_id').gte(_.first(docs)._id);
    if (docs.length <= posts_per_page) {
      query.lte(_.last(docs)._id);
    }
    else {
      query.lt(_.last(docs)._id);
    }

    query.select(posts_in_fields.join(' ')).setOptions({ lean: true })
        .exec(function (err, posts) {

      if (err) {
        next(err);
        return;
      }

      env.data.posts = posts;

      env.extras.puncher.stop(!!posts ? { count: posts.length} : null);
      env.extras.puncher.stop();

      next();
    });
  });

};


// Build response:
//  - posts list -> posts
//  - collect users ids
//
nodeca.filters.after('@', function build_posts_list_and_users(params, next) {
  var env = this;
  var posts;

  env.extras.puncher.start('Post-process posts/users');

  posts = this.response.data.posts = this.data.posts;

  env.data.users = env.data.users || [];

  // collect users
  posts.forEach(function (post) {
    if (post.user) {
      env.data.users.push(post.user);
    }
  });

  env.extras.puncher.stop();

  next();
});


// Fill head meta & fetch/fill breadcrumbs
//
nodeca.filters.after('@', function fill_head_and_breadcrumbs(params, next) {
  var env = this;
  var t_params;
  var query;
  var fields;
  var data = this.response.data;
  var thread = this.data.thread;
  var forum = this.data.section;

  if (env.session && env.session.hb) {
    thread.cache.real = thread.cache.hb;
  }

  // prepare page title
  data.head.title = thread.title;
  if (params.page > 1) {
    t_params = { title: thread.title, page: params.page };
    data.head.title = env.helpers.t('forum.title_with_page', t_params);
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
      next(err);
      return;
    }

    parents.push(forum);
    data.widgets.breadcrumbs = forum_breadcrumbs(env, parents);

    env.extras.puncher.stop();
    
    next();
  });

});
