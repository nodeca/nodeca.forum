// Main forum page (forums list)
//
"use strict";


var forum_breadcrumbs = require('../../lib/forum_breadcrumbs.js');
var to_tree = require('../../lib/to_tree.js');
var fetch_sections_visibility = require('../../lib/fetch_sections_visibility');


var sections_in_fields = [
  '_id',
  'id',
  'title',
  'description',
  'parent',
  'parent_list',
  'moderator_list',
  'display_order',
  'level',
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


////////////////////////////////////////////////////////////////////////////////

module.exports = function (N, apiPath) {
  N.validate(apiPath, {
  });


  // Request handler
  //
  N.wire.on(apiPath, function (env, callback) {
    var query;

    env.extras.puncher.start('Get forums');

    // build tree for 0..2 levels, start from sections without parent
    query = { level: {$lte: 2} };

    // FIXME add permissions check
    N.models.forum.Section
        .find(query)
        .sort('display_order')
        .setOptions({ lean: true })
        .select(sections_in_fields.join(' '))
        .exec(function (err, sections) {
      if (err) {
        callback(err);
        return;
      }

      env.extras.puncher.stop({ count: sections.length });
      env.data.sections = sections;

      callback();
    });
  });


  // removes sections for which user has no rights to access:
  //
  //  - forum_show
  //
  N.wire.after(apiPath, function clean_sections(env, callback) {

    var filtered_sections = [];
    var sections          = env.data.sections.map(function (s) { return s._id; });
    var usergroups        = env.extras.settings.params.usergroup_ids;

    env.extras.puncher.start('Filter sections');

    fetch_sections_visibility(sections, usergroups, function (err, results) {
      if (err) {
        callback(err);
        return;
      }

      env.data.sections.forEach(function (section) {
        var o = results[section._id];

        if (o && o.forum_show) {
          filtered_sections.push(section);
        }
      });

      env.extras.puncher.stop({ count: filtered_sections.length });
      env.data.sections = filtered_sections;

      callback();
    });
  });


  //
  // Build response:
  //  - forums list -> filtered tree
  //  - collect users ids (last posters & moderators)
  //
  N.wire.after(apiPath, function fill_forums_tree_and_users(env, callback) {

    env.extras.puncher.start('Post-process forums/users');

    if (env.session && env.session.hb) {
      env.data.sections = env.data.sections.map(function (doc) {
        doc.cache.real = doc.cache.hb;
        return doc;
      });
    }


    env.data.users = env.data.users || [];

    // collect users from sections
    env.data.sections.forEach(function (doc) {
      // queue users only for first 2 levels (those are not displayed on level 3)
      if (doc.level < 2) {
        if (!!doc.moderator_list) {
          doc.moderator_list.forEach(function (user) {
            env.data.users.push(user);
          });
        }
        if (doc.cache.real.last_user) {
          env.data.users.push(doc.cache.real.last_user);
        }
      }
    });

    env.response.data.users = env.data.users;
    env.response.data.sections = to_tree(env.data.sections, null);

    // Cleanup output tree - delete attributes, that are not white list.
    // Since tree points to the same objects, that are in flat list,
    // we use flat array for iteration.
    env.data.sections.forEach(function (doc) {
      for (var attr in doc) {
        if (doc.hasOwnProperty(attr) &&
            sections_out_fields.indexOf(attr) === -1) {
          delete(doc[attr]);
        }
      }
      delete (doc.cache.hb);
    });

    env.extras.puncher.stop();

    callback();
  });


  //
  // Fill breadcrumbs and head meta
  //
  N.wire.after(apiPath, function set_forum_index_breadcrumbs(env) {
    var data = env.response.data;

    data.head.title = env.helpers.t('forum.index.title');
    data.blocks = data.blocks || {};
    data.blocks.breadcrumbs = forum_breadcrumbs(env);
  });
};
