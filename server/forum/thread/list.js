/*global nodeca*/


module.exports = function (params, next) {
  next();
};


nodeca.filters.before('@', 100, function (params, next) {
  var data = this.response.data;

  nodeca.models.forum.thread.find({}, function (err, threads) {
    data.threads = threads;
    next(err);
  });
});
