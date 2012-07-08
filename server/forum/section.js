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
  var options = {'forum_id': params.id};
  Thread.fetchThreads(options, function(thread, callback){
    user_id_list.push(thread.first_post.user);
    user_id_list.push(thread.last_post.user);
    callback();
  }, function(err, threads) {
    data.threads= threads;
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
