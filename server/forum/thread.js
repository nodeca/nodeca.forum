"use strict";

/*global nodeca*/

var Section = nodeca.models.forum.Section;
var Thread = nodeca.models.forum.Thread;
var Post = nodeca.models.forum.Post;

var forum_breadcrumbs = require('../../lib/widgets/breadcrumbs.js').forum;

module.exports = function (params, next) {
  next();
};


nodeca.filters.before('@', function (params, next) {
  var data = this.response.data;

  Thread.fetchById(params.id, function (err, thread) {
    data.thread = thread;
    next(err);
  });
});


nodeca.filters.before('@', function (params, next) {
  var data = this.response.data;

  Post.fetchPostsByThread(data.thread._id, function (err, posts) {
    data.posts = posts;
    next(err);
  });
});

nodeca.filters.after('@', function (params, next) {
  var env = this;
  var data = this.response.data;
  Section.fetchSectionById(data.thread.forum_id, function(err, forum) {
    if (err) {
      next(err);
      return;
    }
    Section.fetchSections(forum.parent_list, function(err, parents) {
      parents.push(forum);
      data.widgets.breadcrumbs = forum_breadcrumbs(env, parents);
      next(err);
    });
  });
});
