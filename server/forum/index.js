"use strict";

/*global nodeca, _*/

var forum_breadcrumbs = require('../../lib/breadcrumbs.js').forum;

var Section = nodeca.models.forum.Section;


// fetch and prepare sections
//
// params is empty
module.exports = function (params, next) {
  var env = this;

  env.extras.puncher.start('Get forums');

  Section.build_tree(this, null, function(err) {
    env.extras.puncher.stop();
    next(err);
  });
};


// breadcrumbs and head meta
nodeca.filters.after('@', function forum_index_breadcrumbs(params, next) {
  this.response.data.head.title = this.helpers.t('common.forum.title');
  this.response.data.widgets.breadcrumbs = forum_breadcrumbs(this);
  next();
});
