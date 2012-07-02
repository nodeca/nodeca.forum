"use strict";

/*global nodeca*/

var Section = nodeca.models.forum.Section;
var Thread = nodeca.models.forum.Thread;

var forum_breadcrumbs = require('../../lib/widgets/breadcrumbs.js').forum;

var forum_helpers = require('../../lib/helpers/forum.js');
var build_tree = forum_helpers.build_tree;
var prepare_section_display_info = forum_helpers.prepare_section_display_info;


// fetch and prepare threads and sub-forums
// ToDo add sorting and pagination
module.exports = function (params, next) {
  var data = this.response.data;

  var user_id_list = this.data.users = [];

  // prepare sub-forums
  var sections = nodeca.cache.get('sections', []);
  var root = sections[params.id]._id;

  this.response.data.sections = build_tree(sections, root, 2, function(section) {
    return prepare_section_display_info(section, user_id_list);
  });

  // fetch and prepare threads
  Thread.fetchThredsByForumId(params.id, function (err, threads) {
    data.threads = threads.map(function(thread) {
      // ToDo check permissions
      var doc = thread._doc;
      doc._id = doc._id.toString();

      user_id_list.push(doc.cache.real.first_user);
      user_id_list.push(doc.cache.real.last_user);

      return {
        _id:              doc._id,
        id:               doc.id,
        title:            doc.title,
        prefix:           doc.prefix,
        forum_id:         doc.forum_id,
        post_count:       doc.cache.real.post_count,
        views_count:      doc.cache.real.views_count,

        first_post: {
          id:  doc.cache.real.first_post_id,
          user:     doc.cache.real.first_user,
          ts:       doc.cache.real.first_ts
        },
        last_post: {
          id:   doc.cache.real.last_post_id,
          user:      doc.cache.real.last_user,
          ts:        doc.cache.real.last_ts
        }
      };

    });
    // ToDo build users list (authors, moderators, commentators)
    next();
  });
};


// prepare forum info (page top)
nodeca.filters.after('@', function (params, next) {
  var sections = nodeca.cache.get('sections');

  // ToDo hb users check
  var thread_count = sections[params.id].cache.real.thread_count;
  this.response.data.forum = {
    id: params.id,
    title: sections[params.id].title,
    thread_count: thread_count
  };
  next();
});


// breadcrumbs
nodeca.filters.after('@', function (params, next) {
  var sections = nodeca.cache.get('sections');

  var parents = [];
  var forum = sections[params.id];
  forum.parent_id_list.forEach(function(parent) {
    parents.push(sections[parent]);
  });

  this.response.data.widgets.breadcrumbs = forum_breadcrumbs(this, parents);
  next();
});
