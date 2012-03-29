/*global nodeca*/


module.exports = function (params, next) {
  next();
};


nodeca.filters.before('@', 100, function (params, next) {
  var data = this.response.data;

  nodeca.models.forum.thread.find({id: params.id}, function (err, threads) {
    data.thread = threads.pop();
    next(err);
  });
});


nodeca.filters.before('@', 100, function (params, next) {
  var data = this.response.data;

  nodeca.models.forum.post.find({thread: data.thread._id}, function (err, posts) {
    data.posts = posts;
    next(err);
  });
});
