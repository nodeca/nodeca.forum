"use strict";

/*global nodeca*/


module.exports = function (params, next) {
  next();
};


nodeca.filters.before('@', function (params, next) {
  var data = this.response.data;

  nodeca.models.forum.Thread.findOne({id: params.id}, function (err, thread) {
    data.thread = thread;
    next(err);
  });
});


nodeca.filters.before('@', function (params, next) {
  var data = this.response.data;

  nodeca.models.forum.Post.find({thread: data.thread._id}, function (err, posts) {
    data.posts = posts;
    next(err);
  });
});
