"use strict";

/*global nodeca*/

var Section = nodeca.models.forum.Section;
var Thread = nodeca.models.forum.Thread;
var Post = nodeca.models.forum.Post;

var forum_breadcrumbs = require('../../lib/breadcrumbs.js').forum;

// fetch thread
nodeca.filters.before('@', function (params, next) {
  var env = this;

  var fields = [
    '_id',
    'forum_id',
    'title',
    'state',
    'keywords'
  ];
  // ToDo hb vs real
  fields.push('cache.real');

  env.data.threads = {};
  Thread.findOne({id: params.id}, function(err, doc) {
    env.data.threads[params.id] = doc;
    next();
  });
});


// fetch and prepare posts
// ToDo add sorting and pagination
module.exports = function (params, next) {
  var env = this;
  var options = {
    thread_id: params.id
  };

  Post.fetchPosts(this, options, function() {
    // prepare thread info
    var thread = env.data.threads[params.id];
    env.response.data.thread = {
      forum_id:   thread.forum_id,
      seo_desc:   thread.seo_desc,
      id:         params.id,
      title:      thread.title,
      post_count: thread.post_count
    };
    next();
  });
};


// breadcrumbs and head meta
nodeca.filters.after('@', function (params, next) {
  var sections = this.data.sections;
  var thread = this.data.threads[params.id];
  var forum_id = thread.forum_id;
  var forum = sections[forum_id];
  var parents = [];

  this.response.data.head.title = thread.title;

  forum.parent_id_list.forEach(function(parent) {
    parents.push(sections[parent]);
  });
  parents.push(forum);

  this.response.data.widgets.breadcrumbs = forum_breadcrumbs(this, parents);

  next();
});
