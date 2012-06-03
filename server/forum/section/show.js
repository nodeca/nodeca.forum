"use strict";

/*global nodeca*/

var Section = nodeca.models.forum.Section;
var Thread = nodeca.models.forum.Thread;

module.exports = function (params, next) {
  next();
};


nodeca.filters.before('@', function (params, next) {
  var data = this.response.data;

  Section.fetchSectionById(params.id, function (err, forum) {
    data.forum = forum;
    next(err);
  });
});

nodeca.filters.before('@', function (params, next) {
  var data = this.response.data;

  Thread.fetchThredsByForumId(params.id, function (err, threads) {
    data.threads = threads;
    next(err);
  });
});
