"use strict";

/*global nodeca*/

var Section = nodeca.models.forum.Section;
var Thread = nodeca.models.forum.Thread;

var forum_breadcrumbs = require('../../lib/breadcrumbs.js').forum;


// fetch and prepare threads and sub-forums
// ToDo add sorting and pagination
//
// ##### params
//
// - `id`   forum id
module.exports = function (params, next) {
  var env = this;

  // prepare sub-forums
  var root = this.data.sections[params.id]._id;
  Section.build_tree(env, root, 2, function(err) {
    // fetch and prepare threads
    var query = {'forum_id': params.id};
    Thread.fetchThreads(env, query, function(err) {
      // ToDo hb users check
      var parent = env.data.sections[params.id];
      var thread_count = parent.thread_count;
      env.response.data.forum = {
        id: params.id,
        title: parent.title,
        description: parent.description,
        thread_count: thread_count
      };
      next();
    });
  });
};


// breadcrumbs and head meta
nodeca.filters.after('@', function (params, next) {
  var sections = this.data.sections;

  var parents = [];
  var forum = sections[params.id];
  
  this.response.data.head.title = forum.title;

  forum.parent_id_list.forEach(function(parent) {
    parents.push(sections[parent]);
  });

  this.response.data.widgets.breadcrumbs = forum_breadcrumbs(this, parents);
  next();
});
