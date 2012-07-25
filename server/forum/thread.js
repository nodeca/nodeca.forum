"use strict";

/*global nodeca, _*/

var NLib = require('nlib');
var Async = NLib.Vendor.Async;

var Section = nodeca.models.forum.Section;
var Thread = nodeca.models.forum.Thread;
var Post = nodeca.models.forum.Post;

var forum_breadcrumbs = require('../../lib/forum_breadcrumbs.js').forum;

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


// fetch thread and forum info to simplify permisson check
nodeca.filters.before('@', function (params, next) {
  var env = this;

  env.extras.puncher.start('Thread info prefetch');

  Thread.findOne({id: params.id}).setOptions({ lean: true }).exec(function(err, thread) {

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
    Section.findOne({_id: thread.forum}).setOptions({ lean: true }).exec(function(err, forum) {

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
// ToDo add sorting and pagination
//
// ##### params
//
// - `id`         thread id
// - `forum_id`   forum id
module.exports = function (params, next) {
  var env = this;
  var query = {
    thread_id: params.id
  };

  env.extras.puncher.start('Get posts');

  // FIXME - calculate state conditions, pagination & add deleted posts

  Post.find(query).select(posts_in_fields).setOptions({ lean: true })
      .exec(function(err, posts){

    if (err) {
      next(err);
      return;
    }

    // Thread with no posts -> Something broken, return "Not Found"
    if (!posts) {
      next({ statusCode: 404 });
      return;
    }

    env.data.posts = posts;

    env.extras.puncher.stop(!!posts ? { count: posts.length} : null);

    next(err);
  });
};


// init posts response section and collect user ids
nodeca.filters.after('@', function (params, next) {
  var env = this;

  var posts = this.response.data.posts = this.data.posts;

  env.data.users = env.data.users || [];

  // collect users
  posts.forEach(function(post) {
    if (post.user) {
      env.data.users.push(post.user);
    }
  });
  next();
});


// breadcrumbs and head meta
nodeca.filters.after('@', function (params, next) {
  var env = this;
  var data = this.response.data;

  var thread = this.data.thread;

  var forum = this.data.section;

  // prepare page title
  data.head.title = thread.title;

  // prepare thread info
  data.thread = {
    forum_id:   thread.forum_id,
    seo_desc:   thread._seo_desc,
    id:         thread.id,
    title:      thread.title
  };
  if (this.session.hb) {
    data.thread.post_count = thread.cache.hb.post_count;
  }
  else {
    data.thread.post_count = thread.cache.real.post_count;
  }

  // build breadcrumbs
  var query = { _id: { $in: forum.parent_list }};
  var fields = { '_id':1, 'id':1, 'title':1 };

  env.extras.puncher.start('Build breadcrumbs');

  Section.find(query).select(fields).sort({ 'level':1 })
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
