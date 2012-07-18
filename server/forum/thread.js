"use strict";

/*global nodeca*/

var Thread = nodeca.models.forum.Thread;
var Post = nodeca.models.forum.Post;

var forum_breadcrumbs = require('../../lib/breadcrumbs.js').forum;


// fetch thread
nodeca.filters.before('@', function (params, next) {
  var env = this;

  Thread.findOne({id: params.id}).setOptions({lean: true }).exec(function(err, doc) {
    if (!err) {
      if (env.session.hb) {
        doc.cache.real = doc.cache.hb;
      }
      env.data.thread = doc;
    }
    next(err);
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
        env.data.users.push(doc.user);
      });
    }
    
    next(err);
  });
};


// breadcrumbs and head meta
nodeca.filters.after('@', function (params, next) {
  var sections = this.data.sections;
  var thread = this.data.thread;

  var forum_id = params.forum_id;
  var forum = sections[forum_id];
  var parents = [];

  // prepare page title
  this.response.data.head.title = thread.title;

  // prepare thread info
  this.response.data.thread = {
    forum_id:   thread.forum_id,
    seo_desc:   thread.cache.real.seo_desc,
    id:         params.id,
    title:      thread.title,
    post_count: thread.cache.real.post_count
  };

  // build breadcrumbs
  forum.parent_id_list.forEach(function(parent) {
    parents.push(sections[parent]);
  });
  parents.push(forum);

  this.response.data.widgets.breadcrumbs = forum_breadcrumbs(this, parents);

  next();
});
