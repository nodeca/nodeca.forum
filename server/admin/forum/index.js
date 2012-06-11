"use strict";

/*global nodeca*/

module.exports = function (params, next) {
  next();
};

var Section = nodeca.models.forum.Section;
var Thread = nodeca.models.forum.Thread;

nodeca.filters.before('@', function (params, next) {
  var data = this.response.data;

  Section.fetchCategories(function (err, sections) {
    if (!err) {
      data.sections = sections;
    }
    next(err);
  });
});
