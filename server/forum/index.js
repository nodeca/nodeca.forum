"use strict";

/*global nodeca, _*/

var NLib = require('nlib');

var Async = NLib.Vendor.Async;

var forum_breadcrumbs = require('../../lib/widgets/breadcrumbs.js').forum;
var build_tree = require('../../lib/helpers/forum.js').build_tree;

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

  var sections = _.values(nodeca.cache.get('sections', [])).map(function(section) {
    // ToDo check permissions
    var doc = section._doc;
    doc._id = doc._id.toString();
    if (doc.parent) {
      doc.parent = doc.parent.toString();
    }
    else {
      doc.parent = null;
    }
    // ToDo replace real for hb users
    return {
      _id:              doc._id,
      id:               doc.id,
      title:            doc.title,
      description:      doc.description,
      parent:           doc.parent,
      redirect:         doc.redirect,
      moderators:       doc.moderators_id_list,
      thread_count:     doc.cache.real.thread_count,
      post_count:       doc.cache.real.post_count,
      display_order:    doc.display_order,
      last_thread: {
        title:          doc.cache.real.last_thread_title,
        id:             doc.cache.real.last_thread_id,
        last_post_id:   doc.cache.real.last_post_id,
        last_user:      doc.cache.real.last_user,
        last_ts:        doc.cache.real.last_ts
      }
    };
  });
  this.response.data.sections = build_tree(sections);
  // ToDo build users list (authors, moderators, commentators)
  next();
};


// fetch and prepare users info
// fired befor each controllers in forum/admin.forum
// list of user id should be prepared in controller
nodeca.filters.after('forum', function (params, next) {
  // ToDo fetch users
  // user_list = this.data.users;
  next();
});


// breadcrumbs
nodeca.filters.after('@', function (params, next) {
  this.response.data.widgets.breadcrumbs = forum_breadcrumbs(this);
  next();
});

