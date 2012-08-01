"use strict";

/*global nodeca, _*/

var forum_breadcrumbs = require('../../lib/forum_breadcrumbs.js');
var to_tree = require('../../lib/to_tree.js');

var Section = nodeca.models.forum.Section;

var sections_in_fields = [
  '_id',
  'id',
  'title',
  'description',
  'parent',
  'parent_list',
  'moderator_list',
  'display_order',
  'cache'
];

var sections_out_fields = [
  '_id',
  'id',
  'title',
  'description',
  'moderator_list',
  'child_list',
  'cache'
];


// fetch and prepare sections
//
// params - empty
//
module.exports = function (params, next) {
  var env = this;

  env.extras.puncher.start('Get forums');

  // build tree from 0..2 levels, start from sections without parent
  var query = { level: {$lte: 2} };

  // FIXME add permissions check
  Section.find(query).sort('display_order').setOptions({lean:true})
      .select(sections_in_fields.join(' ')).exec(function(err, sections){
    if (err) {
      next(err);
      return;
    }
    env.data.sections = sections;
    env.extras.puncher.stop({ count: sections.length });
    next();
  });
};


//
// Build response:
//  - forums list -> filtered tree
//  - collect users ids (last posters & moderators)
//
nodeca.filters.after('@', function forum_index_breadcrumbs(params, next) {
  var env = this;

  env.extras.puncher.start('Post-process forums/users');

  if (env.session.hb) {
    this.data.sections = this.data.sections.map(function(doc) {
      doc.cache.real = doc.cache.hb;
      return doc;
    });
  }

  this.response.data.sections = to_tree(this.data.sections, null);

  // Cleanup output tree - delete attributes, that are not white list.
  // Since tree points to the same objects, that are in flat list,
  // we use flat array for iteration.
  this.data.sections.forEach(function(doc) {
    for (var attr in doc) {
      if (doc.hasOwnProperty(attr) &&
          sections_out_fields.indexOf(attr) === -1) {
        delete(doc[attr]);
      }
    }
    delete (doc.cache.hb);
  });

  env.data.users = env.data.users || [];

  // collect users from sections
  this.data.sections.forEach(function(doc){
    if (!!doc.moderator_list) {
      doc.moderator_list.forEach(function(user) {
        env.data.users.push(user);
      });
    }
    if (doc.cache.real.last_user) {
      env.data.users.push(doc.cache.real.last_user);
    }
  });
  env.extras.puncher.stop();

  next();
});


//
// Fill breadcrumbs and head meta
//
nodeca.filters.after('@', function forum_index_breadcrumbs(params, next) {
  this.response.data.head.title = this.helpers.t('common.forum.title');
  this.response.data.widgets.breadcrumbs = forum_breadcrumbs(this);
  next();
});
