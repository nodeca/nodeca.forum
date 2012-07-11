"use strict";

/*global nodeca, _*/

var NLib = require('nlib');

var Async = NLib.Vendor.Async;

var forum_breadcrumbs = require('../../lib/breadcrumbs.js').forum;


var Section = nodeca.models.forum.Section;
var Thread  = nodeca.models.forum.Thread;

// Temporary crutch
// added sections to cache
function fetch_sections(params, next) {
  var data = this.data
  if (!nodeca.cache.has('sections')) {
    Section.fetchSections(this, {}, function (err) {
      if (!err) {
        var cache = {};
        data.sections.forEach(function(section) {
          cache[section.id] = section;
        });
        nodeca.cache.set('sections', cache);
      }
      next(err);
    });
  }
  else {
    next();
  }
}


// fetch_sections fired befor each controllers in forum/admin.forum
['forum', 'admin.forum'].forEach(function (k) {
  nodeca.filters.before(k, fetch_sections);
});


// fetch and prepare sections
module.exports = function (params, next) {
  var user_id_list = this.data.users = [];
  var sections = nodeca.cache.get('sections', []);
  var data = this.response.data

  Section.build_tree(this, null, 3, next);
};


// breadcrumbs and head meta
nodeca.filters.after('@', function forum_index_breadcrumbs(params, next) {
  this.response.data.head.title = this.helpers.t('common.forum.title');
  this.response.data.widgets.breadcrumbs = forum_breadcrumbs(this);
  next();
});

