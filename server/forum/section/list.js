/*global nodeca*/


module.exports = function (params, next) {
  next();
};


nodeca.filters.before('@', 100, function (params, next) {
  var data = this.response.data;

  nodeca.models.forum.section.find({}, function (err, sections) {
    data.sections = sections;
    next(err);
  });
});
