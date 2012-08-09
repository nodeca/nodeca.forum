"use strict";

/*global nodeca, _*/

var NLib = require('nlib');
var Async = NLib.Vendor.Async;

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
  '_views_count',
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
  'is_category'
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
}
nodeca.validate(params_schema);


// Prefetch forum to simplify permisson check.
// Check that forum exists.
//
nodeca.filters.before('@', function (params, next) {
  var env = this;

  env.extras.puncher.start('Forum info prefetch');

  Section.findOne({ id: params.id }).setOptions({ lean: true })
      .exec(function(err, forum) {

    if (err) {
      next(err);
      return;
    }

    // No forum -> "Not Found" status
    if (!forum) {
      next({ statusCode: 404 });
      return;
    }

    env.data.section = forum;

    env.extras.puncher.stop();

    next(err);
  });
});


// fetch and prepare threads
//
// ##### params
//
// - `id`   forum id
//
module.exports = function (params, next) {
  var env = this;

  var sort = {};
  var start;
  var query;

  var threads_per_page = nodeca.settings.global.get('threads_per_page');

  env.response.data.show_page_number = false;

  env.extras.puncher.start('Get threads');
  env.extras.puncher.start('Thread ids prefetch');

  if (env.session.hb) {
    sort['cache.hb.last_ts'] = -1;
  }
  else {
    sort['cache.real.last_ts'] = -1;
  }

  // FIXME add state condition to select only visible threads
  start = (params.page - 1) * threads_per_page;

  // Fetch IDs of "visible" threads interval (use coverage index)
  Thread.find({ forum_id: params.id }).select('_id').sort(sort).skip(start)
      .limit(threads_per_page + 1).setOptions({ lean: true }).exec(function(err, docs) {

    if (err) {
      next(err);
      return;
    }

    if (!docs.length) {
      if (params.page > 1) {

        // FIXME Redirect to last page if possible

        // No page -> "Not Found" status
        next({ statusCode: 404 });
      }
      else {
        // category or forum without threads
        env.extras.puncher.stop();
        env.extras.puncher.stop();

        env.data.threads = [];

        next();
      }
      return;
    }

    env.extras.puncher.stop({ count: docs.length });
    env.extras.puncher.start('Get threads by _id list');

    // FIXME modify state condition (deleted and etc) if user has permission
    // If no hidden threads - no conditions needed, just select by IDs

    query = Thread.find({ forum_id: params.id }).where('_id').lte(_.first(docs)._id);
    if (docs.length <= threads_per_page) {
      query.gte(_.last(docs)._id);
    }
    else {
      query.gt(_.last(docs)._id);
    }

    // Select all allowed threads in calculated
    // interval: visible + deleted and others (if allowed by permissions)
    query.select(threads_in_fields.join(' ')).sort(sort)
        .setOptions({ lean: true }).exec(function(err, threads){
      if (err) {
        next(err);
        return;
      }

      env.data.threads = threads;

      env.extras.puncher.stop({ count: threads.length });
      env.extras.puncher.stop();

      next();
    });
  });
};


// fetch sub-forums (only on first page)
//
nodeca.filters.after('@', function (params, next) {
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

  // FIXME add permissions check
  Section.find(query).sort('display_order').setOptions({ lean: true })
      .select(subforums_in_fields.join(' '))
      .exec(function(err, sections) {
    if (err) {
      next(err);
      return;
    }
    env.data.sections = sections;

    env.extras.puncher.stop({ count: sections.length });
    next();
  });
});

// Build response:
//  - forums list -> filtered tree
//  - collect users ids (last posters / moderators / threads authors + last)
//  - threads
//
nodeca.filters.after('@', function (params, next) {
  var env = this;

  var root, max_subforum_level;

  env.extras.puncher.start('Post-process forums/threads/users');

  //
  // Process sections
  //

  if (env.session.hb) {
    this.data.sections = this.data.sections.map(function(doc) {
      doc.cache.real = doc.cache.hb;
      return doc;
    });
  }


  env.data.users = env.data.users || [];
  max_subforum_level = env.data.section.level + 2;

  // collect users from subforums
  this.data.sections.forEach(function(doc) {
    // queue users only for first 2 levels (those are not displayed on level 3)
    if (doc.level < max_subforum_level) {
      if (!!doc.moderator_list) {
        doc.moderator_list.forEach(function(user) {
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
  this.data.sections.forEach(function(doc) {
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

  if (env.session.hb) {
    this.data.threads = this.data.threads.map(function(doc) {
      doc.cache.real = doc.cache.hb;
      return doc;
    });
  }

  // calculate pages number
  var posts_per_page = nodeca.settings.global.get('posts_per_page');
  this.data.threads.forEach(function(doc) {
    doc._pages_count = Math.ceil(doc.cache.real.post_count / posts_per_page);
  });

  this.response.data.threads = this.data.threads;

  // collect users from threads
  this.data.threads.forEach(function(doc) {
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
nodeca.filters.after('@', function (params, next) {
  var env = this;

  var threads_per_page;
  var query;
  var fields;
  var t_params;

  var data = this.response.data;
  var forum = this.data.section;

  if (this.session.hb) {
    forum.cache.real = forum.cache.hb;
  }

  // prepare page title
  data.head.title = forum.title;
  if (params.page > 1) {
    t_params = { title: forum.title, page: params.page };
    data.head.title = env.helpers.t('forum.title_with_page', t_params);
  }

  // prepare forum info
  data.forum = _.pick(forum, forum_info_out_fields);

  // prepare pagination data
  threads_per_page = nodeca.settings.global.get('threads_per_page');
  data.page = {
    max: Math.ceil(forum.cache.real.thread_count / threads_per_page),
    current: parseInt(params.page, 10),
  };

  // fetch breadcrumbs data
  query = { _id: { $in: forum.parent_list } };
  fields = { '_id': 1, 'id': 1, 'title': 1 };

  env.extras.puncher.start('Build breadcrumbs');

  Section.find(query).select(fields).sort({ 'level': 1 })
      .setOptions({ lean: true }).exec(function(err, parents){
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
