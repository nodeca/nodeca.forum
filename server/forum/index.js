"use strict";

/*global nodeca*/


module.exports = function (params, next) {
  next();
};


nodeca.filters.before('@', function (params, next) {
  var data = this.response.data;

  nodeca.models.forum.Section.find({}, function (err, sections) {
    data.sections = sections;
    next(err);
  });
});
