// Show threads list (forum)
//
"use strict";


var _     = require('lodash');
var async = require('async');


var forum_breadcrumbs = require('../../lib/forum_breadcrumbs.js');
var to_tree = require('../../lib/to_tree.js');
var fetch_sections_visibility = require('../../lib/fetch_sections_visibility');


var threads_in_fields = [
  '_id',
  'id',
  'title',
  'prefix',
  'forum_id',
  'views_count',
  'cache'
];


var subforums_in_fields = [
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


var subforums_out_fields = [
  '_id',
  'id',
  'title',
  'description',
  'moderator_list',
  'child_list',
  'cache'
];


var forum_info_out_fields = [
  'id',
  'title',
  'description',
  'parent_id',
  'is_category'
];


// settings that needs to be fetched
var settings_fetch = [
  'posts_per_page',
  'threads_per_page',
  'forum_show',
  'forum_read_topics',
  'forum_reply_topics',
  'forum_start_topics'
];


// settings that would be "exposed" into views
var settings_expose = [
  'forum_read_topics',
  'forum_reply_topics',
  'forum_start_topics'
];


////////////////////////////////////////////////////////////////////////////////

module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    // forum id
    id: {
      type: "integer",
      minimum: 1,
      required: true
    },
    page: {
      type: "integer",
      minimum: 1,
      default: 1
    }
  });


  // shortcuts
  var Section = N.models.forum.Section;
  var Thread = N.models.forum.Thread;


  // Prefetch forum to simplify permisson check.
  // Check that forum exists.
  //
  N.wire.before(apiPath, function prefetch_forum(env, callback) {
    env.extras.puncher.start('Forum info prefetch');

    Section.findOne({ id: env.params.id }).setOptions({ lean: true })
        .exec(function (err, forum) {

      if (err) {
        callback(err);
        return;
      }

      // No forum -> "Not Found" status
      if (!forum) {
        callback(N.io.NOT_FOUND);
        return;
      }

      env.data.section = forum;
      env.extras.puncher.stop();
      callback();
    });
  });


  N.wire.before(apiPath, function section_get_settings(env, callback) {
    env.settings.params.forum_id = env.data.section._id;
    env.extras.puncher.start('Fetch settings');

    env.settings.fetch(settings_fetch, function (err, settings) {
      if (err) {
        callback(err);
        return;
      }

      // propose all settings to data
      env.data.settings = settings;

      // propose settings for views to response.data
      env.response.data.settings = _.pick(settings, settings_expose);
      env.extras.puncher.stop();

      callback();
    });
  });


  N.wire.before(apiPath, function section_check_permissions(env, callback) {
    if (!env.data.settings.forum_show) {
      callback(N.io.NOT_AUTHORIZED);
      return;
    }

    callback();

  });


  // presets pagination data and redirects to the last page if
  // requested page is bigger than max available
  //
  N.wire.before(apiPath, function check_and_set_page_info(env, callback) {
    var per_page = env.data.settings.threads_per_page,
        max      = Math.ceil(env.data.section.cache.real.thread_count / per_page),
        current  = parseInt(env.params.page, 10);

    // forum might have only subforums and no threads,
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


  // fetch and prepare threads
  //
  // ##### params
  //
  // - `id`   forum id
  //
  N.wire.on(apiPath, function check_and_set_page_info(env, callback) {
    // FIXME replace state hardcode
    var VISIBLE_STATE = 0;
    var DELETED_STATE = 1;

    var sort = {};
    var start;
    var query;
    var ids = [];

    var threads_per_page = env.data.settings.threads_per_page;

    env.response.data.show_page_number = false;

    env.extras.puncher.start('Get threads');
    env.extras.puncher.start('Thread ids prefetch');

    if (env.session && env.session.hb) {
      sort['cache.hb.last_ts'] = -1;
    } else {
      sort['cache.real.last_ts'] = -1;
    }

    async.series([
      function (next) {
        // FIXME add state condition to select only visible threads
        start = (env.params.page - 1) * threads_per_page;

        // Fetch IDs of "visible" threads interval
        Thread.find({ forum_id: env.params.id })
            .where('state').equals(VISIBLE_STATE)
            .select('_id cache.real.last_ts').sort(sort).skip(start)
            .limit(threads_per_page + 1).setOptions({ lean: true })
            .exec(function (err, visible_threads) {

          if (err) {
            next(err);
            return;
          }

          env.extras.puncher.stop({ count: visible_threads.length });

          if (!visible_threads.length) {
            if (env.params.page > 1) {
              // When user requests page that is out of possible range we redirect
              // them during before filter (see above).
              //
              // But very rarely, cached threads counter can be out of sync.
              // In this case return 404 for empty result.
              next(N.io.NOT_FOUND);
              return;
            }

            // category or forum without threads
            env.data.threads = [];

            // properly close puncher scope on early interrupt
            env.extras.puncher.stop();

            next();
            return;
          }

          // collect ids
          ids = visible_threads.map(function (thread) {
            return thread._id;
          });

          // FIXME need real check permission
          if (false) {
            next();
            return;
          }

          // Fetch IDs of "delete" threads from (use coverage index)
          Thread.find({ forum_id: env.params.id })
              .where('state').equals(DELETED_STATE)
              .where('cache.real.last_ts')
                .lt(_.first(visible_threads).cache.real.last_ts)
                .gt(_.last(visible_threads).cache.real.last_ts)
              .select('_id').sort(sort)
              .setOptions({ lean: true })
              .exec(function (err, deleted_threads) {

            if (err) {
              next(err);
              return;
            }
            // append ids of deleted threads
            deleted_threads.forEach(function (thread) {
              ids.push(thread._id);
            });
            next();
          });
        });
      },
      function (next) {
        if (_.isEmpty(ids)) {
          next();
          return;
        }
        env.extras.puncher.start('Get threads by _id list');

        // FIXME modify state condition (deleted and etc) if user has permission
        // If no hidden threads - no conditions needed, just select by IDs
        query = Thread.find().where('_id').in(ids).sort(sort);

        // Select all allowed threads in calculated
        // interval: visible + deleted and others (if allowed by permissions)
        query.select(threads_in_fields.join(' ')).sort(sort)
            .setOptions({ lean: true }).exec(function (err, threads) {
          if (err) {
            next(err);
            return;
          }

          env.data.threads = threads;

          env.extras.puncher.stop({ count: threads.length });
          env.extras.puncher.stop();

          next();
        });
      }
    ], callback);
  });


  // fetch sub-forums (only on first page)
  //
  N.wire.after(apiPath, function fill_head_and_breadcrumbs(env, callback) {
    var max_level;
    var query;

    env.data.sections = [];
    // subforums fetched only on first page
    if (env.params.page > 1) {
      callback();
      return;
    }
    env.extras.puncher.start('Get subforums');

    max_level = env.data.section.level + 2; // need two next levels
    query = {
      level: { $lte: max_level },
      parent_list: env.data.section._id
    };

    Section.find(query).sort('display_order').setOptions({ lean: true })
        .select(subforums_in_fields.join(' '))
        .exec(function (err, sections) {
      if (err) {
        callback(err);
        return;
      }

      env.data.sections = sections;
      env.extras.puncher.stop({ count: sections.length });

      callback();
    });
  });


  // removes sub-forums for which user has no rights to access:
  //
  //  - forum_show
  //
  N.wire.after(apiPath, function fill_head_and_breadcrumbs(env, callback) {
    var filtered_sections = [];
    var sections          = env.data.sections.map(function (s) { return s._id; });
    var usergroups        = env.settings.params.usergroup_ids;

    env.extras.puncher.start('Filter sub-forums');

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

  // Build response:
  //  - forums list -> filtered tree
  //  - collect users ids (last posters / moderators / threads authors + last)
  //  - threads
  //
  N.wire.after(apiPath, function fill_head_and_breadcrumbs(env, callback) {
    var root, max_subforum_level;

    env.extras.puncher.start('Post-process forums/threads/users');

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
    max_subforum_level = env.data.section.level + 2;

    // collect users from subforums
    env.data.sections.forEach(function (doc) {
      // queue users only for first 2 levels (those are not displayed on level 3)
      if (doc.level < max_subforum_level) {
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
    env.response.data.sections = to_tree(env.data.sections, root);

    // Cleanup output tree - delete attributes, that are not white list.
    // Since tree points to the same objects, that are in flat list,
    // we use flat array for iteration.
    env.data.sections.forEach(function (doc) {
      for (var attr in doc) {
        if (doc.hasOwnProperty(attr) &&
            subforums_out_fields.indexOf(attr) === -1) {
          delete(doc[attr]);
        }
      }
      delete (doc.cache.hb);
    });


    //
    // Process threads
    //

    if (env.session && env.session.hb) {
      env.data.threads = env.data.threads.map(function (doc) {
        doc.cache.real = doc.cache.hb;
        return doc;
      });
    }

    // calculate pages number
    var posts_per_page = env.data.settings.posts_per_page;
    env.data.threads.forEach(function (doc) {
      doc._pages_count = Math.ceil(doc.cache.real.post_count / posts_per_page);
    });

    env.response.data.threads = env.data.threads;

    // collect users from threads
    env.data.threads.forEach(function (doc) {
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
  N.wire.after(apiPath, function fill_head_and_breadcrumbs(env, callback) {
    var query, fields, t_params;

    var data = env.response.data;
    var forum = env.data.section;

    if (env.session && env.session.hb) {
      forum.cache.real = forum.cache.hb;
    }

    // prepare page title
    data.head.title = forum.title;
    if (env.params.page > 1) {
      t_params = { title: forum.title, page: env.params.page };
      data.head.title = env.helpers.t('forum.title_with_page', t_params);
    }

    // prepare forum info
    data.forum  = _.pick(forum, forum_info_out_fields);

    // fetch breadcrumbs data
    query = { _id: { $in: forum.parent_list } };
    fields = { '_id': 1, 'id': 1, 'title': 1 };

    env.extras.puncher.start('Build breadcrumbs');

    Section.find(query).select(fields).sort({ 'level': 1 })
        .setOptions({ lean: true }).exec(function (err, parents) {
      if (err) {
        callback(err);
        return;
      }

      parents.push(forum);
      data.widgets.breadcrumbs = forum_breadcrumbs(env, parents);

      env.extras.puncher.stop();

      callback();
    });
  });
};