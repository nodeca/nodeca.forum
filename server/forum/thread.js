"use strict";

/*global nodeca, _*/

var NLib = require('nlib');
var Async = NLib.Vendor.Async;

var Section = nodeca.models.forum.Section;
var Thread = nodeca.models.forum.Thread;
var Post = nodeca.models.forum.Post;

var forum_breadcrumbs = require('../../lib/breadcrumbs.js').forum;


// prefetch thread and parent forum
nodeca.filters.before('@', function (params, next) {
  var env = this;

  Async.parallel([
    function(callback){
      env.extras.puncher.start('Forum(parent) info prefetch');

      Section.findOne({id: params.forum_id}).setOptions({lean: true }).exec(function(err, doc) {
        if (!err) {
          env.data.section = doc;
        }
        env.extras.puncher.stop();
        callback(err);
      });
    },
    function(callback){
      env.extras.puncher.start('Thread info prefetch');

      Thread.findOne({id: params.id}).setOptions({lean: true }).exec(function(err, doc) {
        if (!err) {
          env.data.thread = doc;
        }
        env.extras.puncher.stop();
        callback(err);
      });
    },
  ], next);
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

  env.data.users = env.data.users || [];
  // ToDo get state conditions from env
  var fields = [
    '_id', 'id', 'attach_list', 'text', 'fmt', 'html', 'user', 'ts'
  ];
  Post.find(query).select(fields.join(' ')).setOptions({lean: true})
      .exec(function(err, docs){
    if (!err) {
      env.response.data.posts = docs;

      // collect users
      docs.forEach(function(doc) {
        if (doc.user) {
          env.data.users.push(doc.user);
        }
      });
    }
    
    env.extras.puncher.stop(_.isArray(docs) ? { count: docs.length} : null);

    next(err);
  });
};


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
    seo_desc:   thread.cache.real.seo_desc,
    id:         params.id,
    title:      thread.title
  };
  if (this.session.hb) {
    data.thread.post_count = thread.cache.hb.post_count;
  }
  else {
    data.thread.post_count = thread.cache.real.post_count;
  }

  // build breadcrumbs
  var query = {_id: {$in: forum.parent_list}};
  var fields = ['_id', 'id', 'title'];

  env.extras.puncher.start('Build breadcrumbs');
  Section.find(query).select(fields.join(' '))
      .setOptions({lean:true}).exec(function(err, docs){
    docs.push(forum);
    data.widgets.breadcrumbs = forum_breadcrumbs(env, docs);

    env.extras.puncher.stop();
    next();
  });

});
