"use strict";

/*global nodeca*/

var Section = nodeca.models.forum.Section;
var Thread = nodeca.models.forum.Thread;
var Post = nodeca.models.forum.Post;

var forum_breadcrumbs = require('../../lib/widgets/breadcrumbs.js').forum;


// fetch and prepare posts
// ToDo add sorting and pagination
module.exports = function (params, next) {
  var data = this.response.data;

  var user_id_list = this.data.users = [];
  var options = {thread_id:params.id};
  Post.fetchPosts(options, function(post, callback){
    user_id_list.push(post.user);
    callback();
  }, function(err, posts) {
    data.posts = posts;
    next();
  });
};


// fetch and prepare thread info
nodeca.filters.after('@', function (params, next) {
  var env = this;

  Thread.fetchById(params.id, function (err, thread) {
    env.data.thread = thread;
    // ToDo hb users check
    var post_count = thread.cache.real.post_count;
    env.response.data.thread = {
      forum_id: thread.forum_id,
      seo_desc: thread.cache.real.seo_desc,
      id: params.id,
      title: thread.title,
      post_count: post_count
    };
    next(err);
  });
});


// breadcrumbs and head meta
nodeca.filters.after('@', function (params, next) {
  var sections = nodeca.cache.get('sections');

  var forum_id = this.data.thread.forum_id;
  var forum = sections[forum_id];
  var parents = [];

  this.response.data.head.title = this.response.data.thread.title;

  forum.parent_id_list.forEach(function(parent) {
    parents.push(sections[parent]);
  });
  parents.push(forum);

  this.response.data.widgets.breadcrumbs = forum_breadcrumbs(this, parents);
  next();
});
