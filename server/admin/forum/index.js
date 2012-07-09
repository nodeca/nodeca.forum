"use strict";

/*global nodeca, _*/


var Section = nodeca.models.forum.Section;

module.exports = function (params, next) {

  var sections = _.values(nodeca.cache.get('sections', []));

  Section.build_tree(this, null, null, next);
};

