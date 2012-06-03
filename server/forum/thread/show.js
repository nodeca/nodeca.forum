"use strict";

/*global nodeca*/

var Thread = nodeca.models.forum.Thread;
var Post = nodeca.models.forum.Post;

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
