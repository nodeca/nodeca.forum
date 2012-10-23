"use strict";

/*global nodeca, _*/

var Async = require('nlib').Vendor.Async;

var Section = nodeca.models.forum.Section;
var Thread = nodeca.models.forum.Thread;

var forum_breadcrumbs = require('../../lib/forum_breadcrumbs.js');
var to_tree = require('../../lib/to_tree.js');


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


// Validate input parameters
//
var params_schema = {
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
};


nodeca.validate(params_schema);


// Prefetch forum to simplify permisson check.
// Check that forum exists.
//
nodeca.filters.before('@', function prefetch_forum(params, next) {
  var env = this;

  env.extras.puncher.start('Forum info prefetch');

  Section.findOne({ id: params.id }).setOptions({ lean: true })
      .exec(function (err, forum) {

    if (err) {
      next(err);
      return;
    }

    // No forum -> "Not Found" status
    if (!forum) {
      next(nodeca.io.NOT_FOUND);
      return;
    }

    env.data.section = forum;
    env.extras.puncher.stop();
    next();
  });
});


nodeca.filters.before('@', function section_get_settings(params, next) {
  var env = this;

  env.settings.params.forum_id = env.data.section._id;

  env.settings.fetch(settings_fetch, function (err, settings) {
    if (err) {
      next(err);
      return;
    }

    // propose all settings to data
    env.data.settings = settings;

    // propose requirested settings for views to response.data
    env.response.data.settings = _.pick(settings, settings_expose);

    next();
  });
});


nodeca.filters.before('@', function section_check_settings(params, next) {
  if (!this.data.settings.forum_show) {
    next(nodeca.io.NOT_AUTHORIZED);
    return;
  }

  next();
});


// presets pagination data and redirects to the last page if
// requested page is bigger than max available
nodeca.filters.before('@', function check_and_set_page_info(params, next) {
  var per_page = this.data.settings.threads_per_page,
      max      = Math.ceil(this.data.section.cache.real.thread_count / per_page),
      current  = parseInt(params.page, 10);

  // forum might have only subforums and no threads,
  // so check requested page vlidity only when max >= 1
  if (max && current > max) {
    // Requested page is BIGGER than maximum - redirect to the last one
    next({
      code: nodeca.io.REDIRECT,
      head: {
        "Location": nodeca.runtime.router.linkTo(this.request.method, {
          id:   params.id,
          page: max
        })
      }
    });
    return;
  }

  // requested page is OK. propose data for pagination
  this.response.data.page = { max: max, current: current };
  next();
});


// fetch and prepare threads
//
// ##### params
//
// - `id`   forum id
//
module.exports = function (params, next) {
  // FIXME replace state hardcode
  var VISIBLE_STATE = 0;
  var DELETED_STATE = 1;

  var env = this;

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

  Async.series([
    function (callback) {
      // FIXME add state condition to select only visible threads
      start = (params.page - 1) * threads_per_page;

      // Fetch IDs of "visible" threads interval
      Thread.find({ forum_id: params.id })
          .where('state').equals(VISIBLE_STATE)
          .select('_id cache.real.last_ts').sort(sort).skip(start)
          .limit(threads_per_page + 1).setOptions({ lean: true })
          .exec(function (err, visible_threads) {

        if (err) {
          callback(err);
          return;
        }

        env.extras.puncher.stop({ count: visible_threads.length });

        if (!visible_threads.length) {
          if (params.page > 1) {
            // When user requests page that is out of possible range we redirect
            // them during before filter (see above).
            //
            // But very rarely, cached threads counter can be out of sync.
            // In this case return 404 for empty result.
            next(nodeca.io.NOT_FOUND);
            return;
          }

          // category or forum without threads
          env.data.threads = [];

          // properly close puncher scope on early interrupt
          env.extras.puncher.stop();

          callback();
          return;
        }

        // collect ids
        ids = visible_threads.map(function (thread) {
          return thread._id;
        });

        // FIXME need real check permission
        if (false) {
          callback();
          return;
        }

        // Fetch IDs of "delete" threads from (use coverage index)
        Thread.find({ forum_id: params.id })
            .where('state').equals(DELETED_STATE)
            .where('cache.real.last_ts')
              .lt(_.first(visible_threads).cache.real.last_ts)
              .gt(_.last(visible_threads).cache.real.last_ts)
            .select('_id').sort(sort)
            .setOptions({ lean: true })
            .exec(function (err, deleted_threads) {

          if (err) {
            callback(err);
            return;
          }
          // append ids of deleted threads
          deleted_threads.forEach(function (thread) {
            ids.push(thread._id);
          });
          callback();
        });
      });
    },
    function (callback) {
      if (_.isEmpty(ids)) {
        callback();
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
          callback(err);
          return;
        }

        env.data.threads = threads;

        env.extras.puncher.stop({ count: threads.length });
        env.extras.puncher.stop();

        callback();
      });
    }
  ], next);
};


// fetch sub-forums (only on first page)
//
nodeca.filters.after('@', function fetch_sub_forums(params, next) {
  var env = this;

  var max_level;
  var query;

  env.data.sections = [];
  // subforums fetched only on first page
  if (params.page > 1) {
    next();
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
      next(err);
      return;
    }

    env.data.sections = sections;
    env.extras.puncher.stop({ count: sections.length });

    next();
  });
});


// removes sub-forums for which user has no rights to access:
//
//  - forum_show
//
nodeca.filters.after('@', function clean_sub_forums(params, next) {
  var env = this;
  var filtered_sections = [];

  env.extras.puncher.start('Filter subforums');

  Async.forEach(env.data.sections, function (section, cb) {
    var s_params = _.defaults({ forum_id: section._id }, env.settings.params);

    nodeca.settings.get('forum_show', s_params, function (err, val) {
      if (val) {
        filtered_sections.push(section);
      }

      cb(err);
    });
  }, function (err) {
    if (err) {
      next(err);
      return;
    }

    env.extras.puncher.stop({ count: filtered_sections.length });
    env.data.sections = filtered_sections;

    next();
  });
});

// Build response:
//  - forums list -> filtered tree
//  - collect users ids (last posters / moderators / threads authors + last)
//  - threads
//
nodeca.filters.after('@', function fill_forums_tree_users_and_threads(params, next) {
  var env = this;

  var root, max_subforum_level;

  env.extras.puncher.start('Post-process forums/threads/users');

  //
  // Process sections
  //

  if (env.session && env.session.hb) {
    this.data.sections = this.data.sections.map(function (doc) {
      doc.cache.real = doc.cache.hb;
      return doc;
    });
  }


  env.data.users = env.data.users || [];
  max_subforum_level = env.data.section.level + 2;

  // collect users from subforums
  this.data.sections.forEach(function (doc) {
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


  root = this.data.section._id;
  this.response.data.sections = to_tree(this.data.sections, root);

  // Cleanup output tree - delete attributes, that are not white list.
  // Since tree points to the same objects, that are in flat list,
  // we use flat array for iteration.
  this.data.sections.forEach(function (doc) {
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
    this.data.threads = this.data.threads.map(function (doc) {
      doc.cache.real = doc.cache.hb;
      return doc;
    });
  }

  // calculate pages number
  var posts_per_page = this.data.settings.posts_per_page;
  this.data.threads.forEach(function (doc) {
    doc._pages_count = Math.ceil(doc.cache.real.post_count / posts_per_page);
  });

  this.response.data.threads = this.data.threads;

  // collect users from threads
  this.data.threads.forEach(function (doc) {
    if (doc.cache.real.first_user) {
      env.data.users.push(doc.cache.real.first_user);
    }
    if (doc.cache.real.last_user) {
      env.data.users.push(doc.cache.real.last_user);
    }
  });

  env.extras.puncher.stop();

  next();
});


// Fill head meta & fetch/fill breadcrumbs
//
nodeca.filters.after('@', function fill_head_and_breadcrumbs(params, next) {
  var env = this;

  var query;
  var fields;
  var t_params;

  var data = this.response.data;
  var forum = this.data.section;

  if (env.session && env.session.hb) {
    forum.cache.real = forum.cache.hb;
  }

  // prepare page title
  data.head.title = forum.title;
  if (params.page > 1) {
    t_params = { title: forum.title, page: params.page };
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
      next(err);
      return;
    }

    parents.push(forum);
    data.widgets.breadcrumbs = forum_breadcrumbs(env, parents);

    env.extras.puncher.stop();

    next();
  });
});
