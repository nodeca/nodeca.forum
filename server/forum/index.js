"use strict";

/*global nodeca, _*/

var NLib = require('nlib');

var Async = NLib.Vendor.Async;

var forum_breadcrumbs = require('../../lib/breadcrumbs.js').forum;


var Section = nodeca.models.forum.Section;
var Thread  = nodeca.models.forum.Thread;


// fetch and prepare sections
module.exports = function (params, next) {
  Section.build_tree(this, null, 3, next);
};


// breadcrumbs and head meta
nodeca.filters.after('@', function forum_index_breadcrumbs(params, next) {
  this.response.data.head.title = this.helpers.t('common.forum.title');
  this.response.data.widgets.breadcrumbs = forum_breadcrumbs(this);
  next();
});

