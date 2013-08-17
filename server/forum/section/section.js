// Show topics list (section)
//
"use strict";


var _     = require('lodash');


var to_tree = require('../../../lib/to_tree.js');
var fetch_sections_visibility = require('../../../lib/fetch_sections_visibility');


var subsections_in_fields = [
  '_id',
  'hid',
  'title',
  'description',
  'parent',
  'parent_list',
  'moderator_list',
  'display_order',
  'level',
  'cache'
];


var subsections_out_fields = [
  '_id',
  'hid',
  'title',
  'description',
  'moderator_list',
  'child_list',
  'cache'
];


var section_info_out_fields = [
  'hid',
  'title',
  'description',
  'is_category'
];


////////////////////////////////////////////////////////////////////////////////

module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    // section hid
    hid: {
      type: "integer",
      minimum: 1,
      required: true
    },
    page: {
      type: "integer",
      minimum: 1,
      'default': 1
    }
  });


  // shortcuts
  var Section = N.models.forum.Section;


  // Just subcall forum.topic.list, that enchances `env`
  //
  N.wire.on(apiPath, function get_posts(env, callback) {
    env.extras.puncher.start('Fetch topics');

    N.wire.emit('server:forum.section.list', env, function (err) {
      env.extras.puncher.stop();

      callback(err);
    });
  });


  // fetch visible sub-sections (only on first page)
  //
  N.wire.after(apiPath, function fetch_visible_subsections(env, callback) {
    var max_level;
    var query;

    env.data.sections = [];
    // subsections fetched only on first page
    if (env.params.page > 1) {
      callback();
      return;
    }

    env.extras.puncher.start('Get subsections');

    max_level = env.data.section.level + 2; // need two next levels
    query = {
      level: { $lte: max_level },
      parent_list: env.data.section._id
    };

    Section
      .find(query)
      .sort('display_order')
      .setOptions({ lean: true })
      .select(subsections_in_fields.join(' '))
      .exec(function (err, sections) {

      env.extras.puncher.stop({ count: sections.length });

      if (err) {
        callback(err);
        return;
      }

      // filter visibility
      var filtered_sections = [];
      var s_ids             = sections.map(function (s) { return s._id; });
      var usergroups        = env.extras.settings.params.usergroup_ids;

      env.extras.puncher.start('Filter sub-sections');

      fetch_sections_visibility(s_ids, usergroups, function (err, results) {
        env.extras.puncher.stop({ count: filtered_sections.length });

        if (err) {
          callback(err);
          return;
        }

        env.data.sections = _.filter(sections, function(section) {
          return results[section._id] && results[section._id].forum_can_view;
        });
        callback();
      });
    });
  });


  // Build response:
  //  - sections list -> filtered tree
  //  - collect users ids (last posters / moderators / topics authors + last)
  //  - topics
  //
  N.wire.after(apiPath, function fill_head_and_breadcrumbs(env, callback) {
    var root, max_subsection_level;

    env.extras.puncher.start('Post-process sections/topics/users');

    //
    // Process sections
    //

    if (env.session && env.session.hb) {
      env.data.sections = env.data.sections.map(function (doc) {
        doc.cache.real = doc.cache.hb;
        return doc;
      });
    }


    env.data.users = env.data.users || [];
    max_subsection_level = env.data.section.level + 2;

    // collect users from subsections
    env.data.sections.forEach(function (doc) {
      // queue users only for first 2 levels (those are not displayed on level 3)
      if (doc.level < max_subsection_level) {
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


    root = env.data.section._id;
    env.res.sections = to_tree(env.data.sections, root);

    // Cleanup output tree - delete attributes, that are not white list.
    // Since tree points to the same objects, that are in flat list,
    // we use flat array for iteration.
    env.data.sections.forEach(function (doc) {
      for (var attr in doc) {
        if (doc.hasOwnProperty(attr) &&
            subsections_out_fields.indexOf(attr) === -1) {
          delete(doc[attr]);
        }
      }
      delete (doc.cache.hb);
    });


    //
    // Process topics
    //

    if (env.session && env.session.hb) {
      env.data.topics = env.data.topics.map(function (doc) {
        doc.cache.real = doc.cache.hb;
        return doc;
      });
    }

    // calculate pages number
    var topics_per_page = env.topics_per_page;
    env.data.topics.forEach(function (doc) {
      doc._pages_count = Math.ceil(doc.cache.real.post_count / topics_per_page);
    });

    env.res.topics = env.data.topics;

    // collect users from topics
    env.data.topics.forEach(function (doc) {
      if (doc.cache.real.first_user) {
        env.data.users.push(doc.cache.real.first_user);
      }
      if (doc.cache.real.last_user) {
        env.data.users.push(doc.cache.real.last_user);
      }
    });

    env.extras.puncher.stop();

    callback();
  });


  // Fill head meta & fetch/fill breadcrumbs
  //
  N.wire.after(apiPath, function fill_head_and_breadcrumbs(env) {
    var t_params;

    var res = env.res;
    var section = env.data.section;

    if (env.session && env.session.hb) {
      section.cache.real = section.cache.hb;
    }

    // prepare page title
    res.head.title = section.title;
    if (env.params.page > 1) {
      t_params = { title: section.title, page: env.params.page };
      res.head.title = env.t('title_with_page', t_params);
    }

    // prepare section info
    res.section  = _.pick(section, section_info_out_fields);
  });


  // fill breadcrumbs info
  //
  N.wire.after(apiPath, function fill_topic_breadcrumbs(env, callback) {
    var parents = env.data.section.parent_list.slice();

    N.wire.emit('internal:forum.breadcrumbs_fill', { env: env, parents: parents }, callback);
  });

};
