"use strict";

/*global nodeca, _*/


var Section = nodeca.models.forum.Section;


// Validate input parameters
//
var params_schema = {
}
nodeca.validate(params_schema);


module.exports = function (params, next) {
  var env = this;

  Section.find().sort('display_order').exec(function(err, sections) {
    if (err) {
      next(err);
      return;
    }
    env.data.sections = sections;
    next();
  });
};

