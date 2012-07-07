"use strict";

/*global nodeca, _*/

var NLib = require('nlib');

var Async = NLib.Vendor.Async;

var forum_breadcrumbs = require('../../lib/widgets/breadcrumbs.js').forum;

var build_avatar_path = require('../../lib/helpers/forum.js').build_avatar_path;

var forum_helpers = require('../../lib/helpers/forum.js');
var build_tree = forum_helpers.build_tree;
var prepare_section_display_info = forum_helpers.prepare_section_display_info;


var Section = nodeca.models.forum.Section;
var Thread = nodeca.models.forum.Thread;

// Temporary crutch
// added sections to cache
function fetch_sections(params, next) {
  if (!nodeca.cache.has('sections')) {
    Section.fetchSections(function (err, sections) {
      if (!err) {
        var cache = {};
        sections.forEach(function(section) {
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
['forum', 'admin.forum'].forEach(function (k) { nodeca.filters.before(k, fetch_sections); });


// fetch and prepare sections
module.exports = function (params, next) {

  var user_id_list = this.data.users = [];
  var sections = nodeca.cache.get('sections', []);

  this.response.data.sections = build_tree(sections, null, 3, function(section) {
    return prepare_section_display_info(section, user_id_list);
  });
  next();
};





// breadcrumbs and head meta
nodeca.filters.after('@', function (params, next) {
  this.response.data.head.title = this.helpers.t('common.forum.title');
  this.response.data.widgets.breadcrumbs = forum_breadcrumbs(this);
  next();
});

