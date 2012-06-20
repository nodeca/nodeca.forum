"use strict";

/*global nodeca*/

var NLib = require('nlib');

var Async = NLib.Vendor.Async;
var _ = NLib.Vendor.Underscore;

var forum_breadcrumbs = require('../../lib/widgets/breadcrumbs.js').forum;
var build_tree = require('../../lib/helpers/forum.js').build_tree;

var Section = nodeca.models.forum.Section;
var Thread = nodeca.models.forum.Thread;


function fetch_sections(params, next) {
  /*jshint validthis:true*/
  var self = this;
  // ToDo try get sections from cache
  Section.fetchSections(function (err, sections) {
    if (!err) {
      self.data.sections = {};
      sections.forEach(function(section) {
        self.data.sections[section.id] = section;
      });
    }
    next(err);
  });
}

['forum', 'admin.forum'].forEach(function (k) { nodeca.filters.before(k, fetch_sections); });
nodeca.filters.before('@', function (params, next) {
  // ToDo fetch users
  // this.data.users = users;
  next();
});

module.exports = function (params, next) {

  var sections = _.values(this.data.sections).map(function(section) {
    // ToDo check permissions
    var doc = section._doc;
    doc._id = doc._id.toString();
    if (doc.parent) {
      doc.parent = doc.parent.toString();
    }
    else {
      doc.parent = null;
    }
    // ToDo replace counters for hb users
    return {
      _id:              doc._id,
      id:               doc.id,
      title:            doc.title,
      description:      doc.description,
      parent:           doc.parent,
      redirect:         doc.redirect,
      moderators:       doc.cache.moderators_id_list,
      thread_count:     doc.cache.counters.thread_count,
      post_count:       doc.cache.counters.post_count,
      display_order:    doc.display_order,
      last_thread: {
        title:          doc.cache.counters.last_thread_title,
        id:             doc.cache.counters.last_thread_id,
        last_post_id:   doc.cache.counters.last_post_id,
        last_user:      doc.cache.counters.last_user,
        last_ts:        doc.cache.counters.last_ts
      }
    };
  });
  this.response.data.sections = build_tree(sections);
  next();
};


nodeca.filters.after('@', function (params, next) {
  this.response.data.widgets.breadcrumbs = forum_breadcrumbs(this);
  next();
});

