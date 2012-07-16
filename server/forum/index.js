"use strict";

/*global nodeca, _*/

var forum_breadcrumbs = require('../../lib/breadcrumbs.js').forum;

var Section = nodeca.models.forum.Section;


// fetch and prepare sections
//
// params is empty
module.exports = function (params, next) {
  Section.build_tree(this, null, 3, next);
};


// breadcrumbs and head meta
nodeca.filters.after('@', function forum_index_breadcrumbs(params, next) {
  this.response.data.head.title = this.helpers.t('common.forum.title');
  this.response.data.widgets.breadcrumbs = forum_breadcrumbs(this);
  next();
});
