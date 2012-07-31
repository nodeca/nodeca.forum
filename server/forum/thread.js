"use strict";

/*global nodeca, _*/

var NLib = require('nlib');
var Async = NLib.Vendor.Async;

var Section = nodeca.models.forum.Section;
var Thread = nodeca.models.forum.Thread;
var Post = nodeca.models.forum.Post;

var forum_breadcrumbs = require('../../lib/forum_breadcrumbs.js');

var posts_in_fields = {
  '_id': 1,
  'id': 1,
  'attach_list': 1,
  'text': 1,
  'fmt': 1,
  'html': 1,
  'user': 1,
  'ts': 1
};

var thread_info_out_fields = [
  'id',
  'title',
  '_seo_desc'
];



// fetch thread and forum info to simplify permisson check
nodeca.filters.before('@', function (params, next) {
  var env = this;

  env.extras.puncher.start('Thread info prefetch');

  Thread.findOne({ id: params.id }).setOptions({ lean: true })
      .exec(function(err, thread) {

    env.extras.puncher.stop();

    if (err) {
      next(err);
      return;
    }

    // No thread -> "Not Found" status
    if (!thread) {
      next({ statusCode: 404 });
      return;
    }

    env.data.thread = thread;
  
    env.extras.puncher.start('Forum(parent) info prefetch');

    // `params.forum_id` can be wrong (old link to moved thread)
    // Use real id from fetched thread
    Section.findOne({ _id: thread.forum }).setOptions({ lean: true })
        .exec(function(err, forum) {

      env.extras.puncher.stop();

      if (err) {
        next(err);
        return;
      }

      // No forum -> thread with missed parent, return "Not Found" too
      if (!forum) {
        next({ statusCode: 404 });
        return;
      }

      // If params.forum_id defined, and not correct - redirect to proper location
      if (params.forum_id && (forum.id !== +params.forum_id)) {

        // FIXME - update pagination
        next({
          statusCode: 302,
          headers: {
            'Location': nodeca.runtime.router.linkTo(
                          'forum.thread', {
                            id: thread.id,
                            forum_id: forum.id
                          }
                        )
          }
        });
        return;
      }

      env.data.section = forum;

      next();
    });
  });
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
  var max_posts = nodeca.settings.global.get('max_posts_per_page');

  env.extras.puncher.start('Get posts');
  env.extras.puncher.start('Post ids prefetch');


  // FIXME add state condition only visible posts
  var conditions = { thread_id: params.id };

  start = (params.page - 1) * max_posts;

  Post.find(conditions).select('_ts').sort('ts').skip(start)
      .limit(max_posts + 1).setOptions({ lean: true }).exec(function(err, docs) {

    // No page -> "Not Found" status
    if (!docs.length) {
      next({ statusCode: 404 });
      return;
    }

    env.extras.puncher.stop(!!docs ? {count: docs.length } : null);
    env.extras.puncher.start('Get posts by _id list');

    var query = Post.find(conditions).where('_id').gte(_.first(docs)._id);
    if (docs.length <= max_posts) {
      query.lte(_.last(docs)._id);
    }
    else {
      query.lt(_.last(docs)._id);
    }

    // FIXME - calculate permissions, add deleted posts
    //
    query.select(posts_in_fields).setOptions({ lean: true })
        .exec(function(err, posts){

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
nodeca.filters.after('@', function (params, next) {
  var env = this;

  env.extras.puncher.start('Post-process posts/users');

  var posts = this.response.data.posts = this.data.posts;

  env.data.users = env.data.users || [];

  // collect users
  posts.forEach(function(post) {
    if (post.user) {
      env.data.users.push(post.user);
    }
  });

  env.extras.puncher.stop();

  next();
});


// Fill head meta & fetch/fill breadcrumbs
//
nodeca.filters.after('@', function (params, next) {
  var env = this;
  var data = this.response.data;
  var thread = this.data.thread;
  var forum = this.data.section;

  if (this.session.hb) {
    thread.cache.real = thread.cache.hb;
  }

  // prepare page title
  data.head.title = thread.title;
  if (params.page > 1) {
    data.head.title += ' - ' + env.helpers.t('forum.head.page') + ' ' + params.page;
  }

  // prepare thread info
  data.thread = _.pick(thread, thread_info_out_fields);

  // prepare pagination data
  var max_posts = nodeca.settings.global.get('max_posts_per_page');
  data.max_page = Math.ceil(thread.cache.real.post_count / max_posts);

  // build breadcrumbs
  var query = { _id: { $in: forum.parent_list }};
  var fields = { '_id': 1, 'id': 1, 'title': 1 };

  env.extras.puncher.start('Build breadcrumbs');

  Section.find(query).select(fields).sort({ 'level': 1 })
      .setOptions({lean:true}).exec(function(err, parents){
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
