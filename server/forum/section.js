"use strict";

/*global nodeca, _*/

var NLib = require('nlib');
var Async = NLib.Vendor.Async;

var Section = nodeca.models.forum.Section;
var Thread = nodeca.models.forum.Thread;

var forum_breadcrumbs = require('../../lib/forum_breadcrumbs.js');
var to_tree = require('../../lib/to_tree.js');

var threads_in_fields = {
  '_id': 1,
  'id': 1,
  'title': 1,
  'prefix': 1,
  'forum_id': 1,
  'cache': 1
};

var subforums_in_fields = {
  '_id' : 1,
  'id' : 1,
  'title' : 1,
  'description' : 1,
  'parent' : 1,
  'parent_list' : 1,
  'moderator_list' : 1,
  'display_order' : 1,
  'cache' : 1
};

var forum_info_out_fields = [
  'id',
  'title',
  'description',
  'is_category'
];


// Prefetch forum to simplify permisson check.
// Check that forum exists.
//
nodeca.filters.before('@', function (params, next) {
  var env = this;

  env.extras.puncher.start('Forum info prefetch');

  Section.findOne({id: params.id}).setOptions({ lean: true })
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


//
// fetch and prepare threads and sub-forums(only on first page)
// ToDo pagination
//
// ##### params
//
// - `id`   forum id
//
module.exports = function (params, next) {
  var env = this;
  var paginate_by;
  var sort = {};
  var ts_from = null;
  var ts_to = null;

  // fetch and prepare threads
  env.extras.puncher.start('Get threads');
  
  var max_threads = nodeca.settings.global.get('max_threads_per_page');

  var start = (params.page - 1) * max_threads;
  var end   = params.page * max_threads;

  if (env.session.hb) {
    paginate_by = 'cache.hb.last_ts';
  }
  else {
    paginate_by = 'cache.real.last_ts';
  }
  sort[paginate_by] = -1;

  // FIXME add state condition only visible thread
  var query = { forum_id: params.id };

  Async.series([
    // get start bourder
    function(callback){
      Thread.find(query).select('cache').sort(sort).skip(start)
          .limit(1).setOptions({ lean: true }).exec(function(err, docs) {

        // No page -> "Not Found" status
        if (!docs.length) {
          next({ statusCode: 404 });
          return;
        }

        if (env.session.hb) {
          ts_from = docs[0].cache.hb.last_ts;
        }
        else {
          ts_from = docs[0].cache.real.last_ts;
        }
        callback();
      });
    },
    // get end bourder
    function(callback){
      Thread.find(query).select('cache').sort(sort).skip(end)
          .limit(1).setOptions({ lean: true }).exec(function(err, docs) {
        if (docs.length) {
          if (env.session.hb) {
            ts_to = docs[0].cache.hb.last_ts;
          }
          else {
            ts_to = docs[0].cache.real.last_ts;
          }
        }
        callback();
      });
    },
    // fetch threads
    function(callback) {
      // FIXME modify state condition (deleted and etc) if user has permission
      if (!!ts_to) {
        query[paginate_by] = { $lt: ts_from, $gte: ts_to };
      }
      else {
        query[paginate_by] = { $lt: ts_from };
      }

      Thread.find(query).select(threads_in_fields).sort(sort)
          .setOptions({ lean: true }).exec(function(err, threads){
        if (err) {
          callback(err);
          return;
        }

        env.data.threads = threads;

        env.extras.puncher.stop(_.isArray(threads) ? { count: threads.length } : null);

        callback();
      });
    },
    // fetch sub-forums
    function(callback){
      env.data.sections = [];
      // subforums fetched only on first page
      if (params.page > 1) {
        callback();
        return;
      }
      env.extras.puncher.start('Get subforums');

      var max_level = env.data.section.level + 2; // need two next levels
      var query = {
        level: { $lte: max_level },
        parent_list: env.data.section._id
      };

      // FIXME add permissions check
      Section.find(query).select(subforums_in_fields).sort('display_order')
          .setOptions({ lean: true }).exec(function(err, sections){
        if (err) {
          callback(err);
          return;
        }
        env.data.sections = sections;

        env.extras.puncher.stop({ count: sections.length });

        callback();
      });
    },
  ], next);

};


// Build response:
//  - forums list -> filtered tree
//  - collect users ids (last posters / moderators / threads authors + last)
//  - threads
//
nodeca.filters.after('@', function (params, next) {
  var env = this;

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

  var root = this.data.section._id;
  this.response.data.sections = to_tree(this.data.sections, root);

  env.data.users = env.data.users || [];

  // collect users from subforums
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

  //
  // Process threads
  //

  if (env.session.hb) {
    this.data.threads = this.data.threads.map(function(doc) {
      doc.cache.real = doc.cache.hb;
      return doc;
    });
  }

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
  var data = this.response.data;
  var forum = this.data.section;

  if (this.session.hb) {
    forum.cache.real = forum.cache.hb;
  }
  // prepare page title
  data.head.title = forum.title;
  if (params.page > 1) {
    data.head.title += ' - ' + env.helpers.t('forum.head.page') + ' ' + params.page;
  }

  // prepare forum info
  data.forum = _.pick(forum, forum_info_out_fields);

  // prepare pagination data
  var max_threads = nodeca.settings.global.get('max_threads_per_page');
  data.max_page = Math.ceil(forum.cache.real.thread_count / max_threads);

  // fetch breadcrumbs data
  var query = { _id: { $in: forum.parent_list } };
  var fields = { '_id': 1, 'id': 1, 'title': 1 };

  env.extras.puncher.start('Build breadcrumbs');

  Section.find(query).select(fields).sort({ 'level': 1 })
      .setOptions({lean:true}).exec(function(err, parents){
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
