"use strict";

/*global nodeca, _*/

var NLib = require('nlib');
var Async = NLib.Vendor.Async;

var Section = nodeca.models.forum.Section;
var Thread = nodeca.models.forum.Thread;

var forum_breadcrumbs = require('../../lib/forum_breadcrumbs.js').forum;
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

var forum_info_cache_out_fields = [
  'thread_count'
];


// prefetch forum to simplify permisson check
nodeca.filters.before('@', function (params, next) {
  var env = this;

  env.extras.puncher.start('Forum info prefetch');

  Section.findOne({id: params.id}).setOptions({lean: true }).exec(function(err, forum) {

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


// fetch and prepare threads and sub-forums
// ToDo pagination
//
// ##### params
//
// - `id`   forum id
module.exports = function (params, next) {
  var env = this;


  Async.series([
    function(callback){
      // prepare sub-forums
      env.extras.puncher.start('Get subforums');

      var max_level = env.data.section.level + 2; // need two next levels
      var query = {
        level: {$lte: max_level},
        parent_list: env.data.section._id
      };

      // ToDo get state conditions from env
      Section.find(query).select(subforums_in_fields).sort('display_order')
          .setOptions({lean:true}).exec(function(err, sections){
        if (err) {
          env.extras.puncher.stop();
          callback(err);
          return;
        }
        env.data.sections = sections;
        env.extras.puncher.stop({ count: sections.length });
        callback();
      });
    },
    function (callback) {
      // fetch and prepare threads
      env.extras.puncher.start('Get threads');

      var query = {forum_id: params.id};

      Thread.find(query).select(threads_in_fields).setOptions({lean: true })
          .exec(function(err, threads){
        if (err) {
          env.extras.puncher.stop();
          callback(err);
          return;
        }

        if (env.session.hb) {
          threads = threads.map(function(doc) {
            doc.cache.real = doc.cache.hb;
            return doc;
          });
        }
        env.data.threads = threads;
        env.extras.puncher.stop(_.isArray(threads) ? { count: threads.length} : null);
        callback();
      });
    }
  ], next);
};


// init response and collect user ids
nodeca.filters.after('@', function (params, next) {
  var env = this;

  env.extras.puncher.start('Build sections tree');
  var root = this.data.section._id;
  this.response.data.sections = to_tree(this.data.sections, root);
  env.extras.puncher.stop();

  this.response.data.threads = this.data.threads;


  env.extras.puncher.start('Collect user ids');
  env.data.users = env.data.users || [];

  // collect users from subforums
  this.data.sections.forEach(function(doc){
    if (doc.moderator_list && _.isArray(doc.moderator_list)) {
      doc.moderator_list.forEach(function(user) {
        env.data.users.push(user);
      });
    }
    if (doc.cache.real.last_user) {
      env.data.users.push(doc.cache.real.last_user);
    }
  });

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


// fetch forums for breadcrumbs build
// prepare head meta
nodeca.filters.after('@', function (params, next) {
  var env = this;
  var data = this.response.data;
  var forum = this.data.section;

  // prepare page title
  data.head.title = forum.title;

  // prepare forum info
  data.forum = _.pick(forum, forum_info_out_fields);
  var cache;
  if (this.session.hb) {
    cache = _.pick(forum.cache.hb, forum_info_cache_out_fields);
  }
  else {
    cache = _.pick(forum.cache.real, forum_info_cache_out_fields);
  }
  data.forum['cache'] = { real: cache };

  var query = { _id: { $in: forum.parent_list } };
  var fields = { '_id' : 1, 'id' : 1, 'title' : 1 };

  env.extras.puncher.start('Build breadcrumbs');

  Section.find(query).select(fields).sort({ 'level':1 })
      .setOptions({lean:true}).exec(function(err, parents){
    if (err) {
      env.extras.puncher.stop();
      next(err);
      return;
    }
    parents.push(forum);
    data.widgets.breadcrumbs = forum_breadcrumbs(env, parents);

    env.extras.puncher.stop();

    next();
  });
});
