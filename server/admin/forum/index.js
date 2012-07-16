"use strict";

/*global nodeca, _*/


var Section = nodeca.models.forum.Section;

module.exports = function (params, next) {
  Section.build_tree(this, null, null, next);
};

