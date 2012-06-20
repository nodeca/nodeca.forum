"use strict";

/*global nodeca*/

var Section = nodeca.models.forum.Section;
var Thread = nodeca.models.forum.Thread;
var Post = nodeca.models.forum.Post;

var forum_breadcrumbs = require('../../lib/widgets/breadcrumbs.js').forum;

nodeca.filters.before('@', function (params, next) {
  var data = this.data;

  Thread.fetchById(params.id, function (err, thread) {
    data.thread = thread;
    next(err);
  });
});

nodeca.filters.before('@', function (params, next) {
  var data = this.data;

  Post.fetchPostsByThread(data.thread._id, function (err, posts) {
    data.posts = posts;
    next(err);
  });
});

module.exports = function (params, next) {
  var data = this.response.data;

  // ToDo hb users check
  var post_count = this.data.thread.cache.counters.post_count;
  data.thread = {
    id: params.id,
    title: this.data.thread.title,
    post_count: post_count
  };

  data.posts = this.data.posts.map(function(post) {
    var doc = post._doc;
    doc._id = doc._id.toString();
    return {
      _id:              doc._id,
      id:               doc.id,
      attach_list:      doc.attach_list,
      text:             doc.text,
      fmt:              doc.fmt,
      html:             doc.html,
      user:             doc.user,
      ts:               doc.ts
    };
  });
  next();
};

nodeca.filters.after('@', function (params, next) {
  var data = this.data;

  var forum_id = this.data.thread.cache.forum_id;
  var forum = this.data.sections[forum_id];
  var parents = [forum];
  forum.cache.parent_id_list.forEach(function(parent) {
    parents.push(data.sections[parent]);
  });

  this.response.data.widgets.breadcrumbs = forum_breadcrumbs(this, parents);
  next();
});
