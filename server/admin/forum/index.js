"use strict";

/*global nodeca, _*/


var Section = nodeca.models.forum.Section;


// Validate input parameters
//
var params_schema = {
}
nodeca.validate(params_schema);


module.exports = function (params, next) {
  Section.build_tree(this, null, null, next);
};

