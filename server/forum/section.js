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
    env.data.users = env.data.users || [];

    // fetch and prepare threads
    var query = {forum_id: params.id};

    var fields = [
      '_id', 'id', 'title', 'prefix', 'forum_id', 'cache'
    ];

    Thread.find(query).select(fields.join(' ')).setOptions({lean: true }).exec(function(err, docs){
      if (!err) {
        env.response.data.threads = docs.map(function(doc) {
          env.data.users.push(doc.cache.real.first_user);
          env.data.users.push(doc.cache.real.last_user);
          if (env.session.hb) {
            doc.cache.real = doc.cache.hb;
          }
          return doc;
        });
      }
      next(err);
    });

  });
};


// breadcrumbs and head meta
nodeca.filters.after('@', function (params, next) {
  var sections = this.data.sections;

  var parents = [];
  var forum = sections[params.id];
 
  // prepare page title
  this.response.data.head.title = forum.title;

  // prepare forum info
  this.response.data.forum = {
    id: params.id,
    title: forum.title,
    description: forum.description,
  };
  if (this.session.hb) {
    this.response.data.forum['thread_count'] = forum.cache.hb.thread_count;
  }
  else {
    this.response.data.forum['thread_count'] = forum.cache.real.thread_count;
  }

  // build breadcrumbs
  forum.parent_id_list.forEach(function(parent) {
    parents.push(sections[parent]);
  });

  this.response.data.widgets.breadcrumbs = forum_breadcrumbs(this, parents);
  next();
});
