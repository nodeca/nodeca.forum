// Main forum page (forums list)
//
"use strict";


var to_tree = require('../../../lib/to_tree.js');
var subsectionsFilterVisible = require('../../../lib/subsections_filter_visible');


var subsections_fields = [
  '_id',
  'hid',
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

    env.extras.puncher.start('Get forums');

    // build tree for 0..2 levels, starting from sections without parent
    N.models.forum.Section
        .find()
        .where('level').lte(2)
        .sort('display_order')
        .setOptions({ lean: true })
        .exec(function (err, subsections) {

      env.extras.puncher.stop({ count: subsections.length });

      if (err) {
        callback(err);
        return;
      }

      env.data.subsections = subsections;

      subsectionsFilterVisible(N, env, callback);
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

    // collect users from subsections
    env.data.subsections.forEach(function (doc) {
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

    env.res.subsections = to_tree(env.data.subsections, null);

    // Cleanup output tree - delete attributes, that are not white list.
    // Since tree points to the same objects, that are in flat list,
    // we use flat array for iteration.
    env.data.subsections.forEach(function (doc) {
      for (var attr in doc) {
        if (doc.hasOwnProperty(attr) &&
            subsections_fields.indexOf(attr) === -1) {
          delete(doc[attr]);
        }
      }
      delete (doc.cache.hb);
    });

    env.extras.puncher.stop();

    callback();
  });


  // Fill breadcrumbs info
  //
  N.wire.after(apiPath, function fill_topic_breadcrumbs(env, callback) {
    N.wire.emit('internal:forum.breadcrumbs_fill', { env: env }, callback);
  });

  // Fill head meta
  //
  N.wire.after(apiPath, function set_forum_index_breadcrumbs(env) {
    env.res.head.title = env.t('title');
  });
};
