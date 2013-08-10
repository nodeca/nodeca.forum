// Show topics list (section)
//
"use strict";


var _     = require('lodash');
var async = require('async');
var memoizee  = require('memoizee');


var forum_breadcrumbs = require('../../../lib/forum_breadcrumbs.js');
var to_tree = require('../../../lib/to_tree.js');
var fetch_sections_visibility = require('../../../lib/fetch_sections_visibility');


var topics_in_fields = [
  '_id',
  'hid',
  'title',
  'prefix',
  'views_count',
  'cache'
];


var subsections_in_fields = [
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


var subsections_out_fields = [
  '_id',
  'id',
  'title',
  'description',
  'moderator_list',
  'child_list',
  'cache'
];


var section_info_out_fields = [
  'id',
  'title',
  'description',
  'is_category'
];


// settings that needs to be fetched
var settings_fetch = [
  'posts_per_page',
  'topics_per_page',
  'forum_can_view',
  'forum_can_reply',
  'forum_can_start_topics'
];


// settings that would be "exposed" into views
var settings_expose = [
  'forum_can_reply',
  'forum_can_start_topics'
];


////////////////////////////////////////////////////////////////////////////////

module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    // section id
    id: {
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
  var Topic = N.models.forum.Topic;


  // Prefetch section to simplify permisson check.
  // Check that section exists.
  //
  N.wire.before(apiPath, function prefetch_section(env, callback) {
    env.extras.puncher.start('Forum info prefetch');

    Section.findOne({ id: env.params.id }).setOptions({ lean: true })
        .exec(function (err, section) {

      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      // No section -> "Not Found" status
      if (!section) {
        callback(N.io.NOT_FOUND);
        return;
      }

      env.data.section = section;
      callback();
    });
  });


  N.wire.before(apiPath, function section_get_settings(env, callback) {
    env.extras.settings.params.section_id = env.data.section._id;
    env.extras.puncher.start('Fetch settings');

    env.extras.settings.fetch(settings_fetch, function (err, settings) {

      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      // propose all settings to data
      env.data.settings = settings;

      // propose settings for views to response.data
      env.response.data.settings = _.pick(settings, settings_expose);

      callback();
    });
  });


  N.wire.before(apiPath, function section_check_permissions(env, callback) {
    if (!env.data.settings.forum_can_view) {
      callback(N.io.NOT_AUTHORIZED);
      return;
    }

    callback();

  });


  // presets pagination data and redirects to the last page if
  // requested page is bigger than max available
  //
  N.wire.before(apiPath, function check_and_set_page_info(env, callback) {
    var per_page = env.data.settings.topics_per_page,
        max      = Math.ceil(env.data.section.cache.real.topic_count / per_page),
        current  = parseInt(env.params.page, 10);

    // section might have only subsections and no topics,
    // so check requested page vlidity only when max >= 1
    if (max && current > max) {
      // Requested page is BIGGER than maximum - redirect to the last one
      callback({
        code: N.io.REDIRECT,
        head: {
          "Location": N.runtime.router.linkTo(env.request.method, {
            id:   env.params.id,
            page: max
          })
        }
      });
      return;
    }

    // requested page is OK. propose data for pagination
    env.response.data.page = { max: max, current: current };
    callback();
  });


  // fetch and prepare topics
  //
  // ##### params
  //
  // - `id`   section id
  //
  N.wire.on(apiPath, function check_and_set_page_info(env, callback) {
    // FIXME replace state hardcode
    //var VISIBLE_STATE = 0;
    //var DELETED_STATE = 1;

    var sort = {};
    var start;
    var query;
    var ids = [];

    var topics_per_page = env.data.settings.topics_per_page;

    env.response.data.show_page_number = false;

    env.extras.puncher.start('Get topics');
    env.extras.puncher.start('Topic ids prefetch');

    if (env.session && env.session.hb) {
      sort['cache.hb.last_ts'] = -1;
    } else {
      sort['cache.real.last_ts'] = -1;
    }

    async.series([
      function (next) {
        // FIXME add state condition to select only visible topics
        start = (env.params.page - 1) * topics_per_page;

        // Fetch IDs of "visible" topics interval
        Topic.find({ section: env.data.section._id })
            //.where('state').equals(VISIBLE_STATE)
            .select('_id cache.real.last_ts').sort(sort).skip(start)
            .limit(topics_per_page + 1).setOptions({ lean: true })
            .exec(function (err, visible_topics) {

          env.extras.puncher.stop({ count: visible_topics.length });

          if (err) {
            next(err);
            return;
          }

          if (!visible_topics.length) {
            // properly close puncher scope on early interrupt
            env.extras.puncher.stop();

            if (env.params.page > 1) {
              // When user requests page that is out of possible range we redirect
              // them during before filter (see above).
              //
              // But very rarely, cached topics counter can be out of sync.
              // In this case return 404 for empty result.
              next(N.io.NOT_FOUND);
              return;
            }

            // category or section without topics
            env.data.topics = [];

            next();
            return;
          }

          // collect ids
          ids = visible_topics.map(function (topic) {
            return topic._id;
          });

          // FIXME need real check permission
          if (false) {
            next();
            return;
          }

          // delete last ID, if successefuly fetched (topics_per_page+1)
          if (ids.length > topics_per_page) { ids.pop(); }

          // Fetch IDs of "hidden" topics (use coverage index)
          /*Topic.find({ section: env.data.section._id })
              .where('state').equals(DELETED_STATE)
              .where('cache.real.last_ts')
                .lt(_.first(visible_topics).cache.real.last_ts)
                .gt(_.last(visible_topics).cache.real.last_ts)
              .select('_id').sort(sort)
              .setOptions({ lean: true })
              .exec(function (err, deleted_topics) {

            if (err) {
              next(err);
              return;
            }
            // append ids of deleted topics
            deleted_topics.forEach(function (topic) {
              ids.push(topic._id);
            });
            next();
          });*/
          next();
        });
      },
      function (next) {
        if (_.isEmpty(ids)) {
          next();
          return;
        }
        env.extras.puncher.start('Get topics by _id list');

        // FIXME modify state condition (deleted and etc) if user has permission
        // If no hidden topics - no conditions needed, just select by IDs
        query = Topic.find().where('_id').in(ids).sort(sort);

        // Select all allowed topics in calculated
        // interval: visible + deleted and others (if allowed by permissions)
        query.select(topics_in_fields.join(' ')).sort(sort)
            .setOptions({ lean: true }).exec(function (err, topics) {

          env.extras.puncher.stop({ count: topics.length });
          env.extras.puncher.stop();

          if (err) {
            next(err);
            return;
          }

          env.data.topics = topics;
          next();
        });
      }
    ], callback);
  });


  // fetch sub-sections (only on first page)
  //
  N.wire.after(apiPath, function fill_head_and_breadcrumbs(env, callback) {
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

    Section.find(query).sort('display_order').setOptions({ lean: true })
        .select(subsections_in_fields.join(' '))
        .exec(function (err, sections) {

      env.extras.puncher.stop({ count: sections.length });

      if (err) {
        callback(err);
        return;
      }

      env.data.sections = sections;
      callback();
    });
  });


  // removes sub-sections for which user has no rights to access:
  //
  //  - forum_can_view
  //
  N.wire.after(apiPath, function fill_head_and_breadcrumbs(env, callback) {
    var filtered_sections = [];
    var sections          = env.data.sections.map(function (s) { return s._id; });
    var usergroups        = env.extras.settings.params.usergroup_ids;

    env.extras.puncher.start('Filter sub-sections');

    fetch_sections_visibility(sections, usergroups, function (err, results) {
      env.extras.puncher.stop({ count: filtered_sections.length });

      if (err) {
        callback(err);
        return;
      }

      env.data.sections.forEach(function (section) {
        var o = results[section._id];

        if (o && o.forum_can_view) {
          filtered_sections.push(section);
        }
      });

      env.data.sections = filtered_sections;
      callback();
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
    env.response.data.users = env.data.users;
    env.response.data.sections = to_tree(env.data.sections, root);

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
    var posts_per_page = env.data.settings.posts_per_page;
    env.data.topics.forEach(function (doc) {
      doc._pages_count = Math.ceil(doc.cache.real.post_count / posts_per_page);
    });

    env.response.data.topics = env.data.topics;

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

    var data = env.response.data;
    var section = env.data.section;

    if (env.session && env.session.hb) {
      section.cache.real = section.cache.hb;
    }

    // prepare page title
    data.head.title = section.title;
    if (env.params.page > 1) {
      t_params = { title: section.title, page: env.params.page };
      data.head.title = env.t('title_with_page', t_params);
    }

    // prepare section info
    data.section  = _.pick(section, section_info_out_fields);
  });


  // Helper - cacheable bredcrumbs info fetch, to save DB request.
  // We can cache it, because cache size is limited by sections count.
  var fetchForumsBcInfo = memoizee(
    function (ids, callback) {
      Section
        .find({ _id: { $in: ids }})
        .select('id title')
        .sort({ 'level': 1 })
        .setOptions({ lean: true })
        .exec(function (err, parents) {
        callback(err, parents);
      });
    },
    {
      async: true,
      maxAge:     60000, // cache TTL = 60 seconds
      primitive:  true   // params keys are calculated as toStrins, ok for our case
    }
  );

  // build breadcrumbs
  N.wire.after(apiPath, function fill_topic_breadcrumbs(env, callback) {
    var section = env.data.section;
    var data = env.response.data;

    env.extras.puncher.start('Build breadcrumbs');

    fetchForumsBcInfo(section.parent_list, function (err, parents) {
      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      var bc_list = parents.slice(); // clone result to keep cache safe
      //bc_list.push(_.pick(section, ['id', 'title']));

      data.blocks = data.blocks || {};
      data.blocks.breadcrumbs = forum_breadcrumbs(env, bc_list);

      callback();
    });
  });

};
