"use strict";

/*global nodeca*/

var Section = nodeca.models.forum.Section;
var Thread = nodeca.models.forum.Thread;

var forum_breadcrumbs = require('../../../lib/widgets/breadcrumbs.js').forum;

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

nodeca.filters.after('@', function (params, next) {
  var env = this;
  var data = this.response.data;
  Section.fetchSections(data.forum.parent_list, function(err, parents) {
    data.widgets.breadcrumbs = forum_breadcrumbs(env, parents);
    next(err);
  });
});
