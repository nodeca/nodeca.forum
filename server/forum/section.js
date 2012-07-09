"use strict";

/*global nodeca*/

var Section = nodeca.models.forum.Section;
var Thread = nodeca.models.forum.Thread;

var forum_breadcrumbs = require('../../lib/breadcrumbs.js').forum;


// fetch and prepare threads and sub-forums
// ToDo add sorting and pagination
module.exports = function (params, next) {
  var env = this;
  // prepare sub-forums
  var sections = nodeca.cache.get('sections', []);
  var root = sections[params.id]._id;

  Section.build_tree(env, root, 2, function(err) {
    // fetch and prepare threads
    var options = {'forum_id': params.id};
    Thread.fetchThreads(env, options, next);
  });
};


// prepare forum info (page top)
nodeca.filters.after('@', function (params, next) {
  var sections = nodeca.cache.get('sections');

  // ToDo hb users check
  var thread_count = sections[params.id].thread_count;
  this.response.data.forum = {
    id: params.id,
    title: sections[params.id].title,
    description: sections[params.id].description,
    thread_count: thread_count
  };
  next();
});


// breadcrumbs and head meta
nodeca.filters.after('@', function (params, next) {
  var sections = nodeca.cache.get('sections');

  var parents = [];
  var forum = sections[params.id];
  
  this.response.data.head.title = forum.title;

  forum.parent_id_list.forEach(function(parent) {
    parents.push(sections[parent]);
  });

  this.response.data.widgets.breadcrumbs = forum_breadcrumbs(this, parents);
  next();
});
