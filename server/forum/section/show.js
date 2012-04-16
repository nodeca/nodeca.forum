"use strict";

/*global nodeca*/


module.exports = function (params, next) {
  next();
};


nodeca.filters.before('@', function (params, next) {
  var data = this.response.data;

  nodeca.models.forum.Section.findOne({id: params.id}, function (err, section) {
    data.section = section;
    next(err);
  });
});

nodeca.filters.before('@', function (params, next) {
  var data = this.response.data;

  nodeca.models.forum.Thread.find({forum_id: params.id}, function (err, threads) {
    data.threads = threads;
    next(err);
  });
});
