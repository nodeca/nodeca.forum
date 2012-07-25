"use strict";

/*global nodeca, _*/

var NLib = require('nlib');
var Async = NLib.Vendor.Async;

var Section = nodeca.models.forum.Section;
var Thread = nodeca.models.forum.Thread;

var forum_breadcrumbs = require('../../lib/breadcrumbs.js').forum;

var thread_fields = {
  '_id': 1,
  'id': 1,
  'title': 1,
  'prefix': 1,
  'forum_id': 1,
  'cache': 1
};


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
      var root = env.data.section._id;
      var deep = env.data.section.level + 2; // need two next levels

      env.extras.puncher.start('Get subforums');

      Section.build_tree(env, root, deep, function(err) {
        env.extras.puncher.stop();
        callback(err);
      });
    },
    function (callback) {
      // fetch and prepare threads
 
      env.data.users = env.data.users || [];

      var query = {forum_id: params.id};

      env.extras.puncher.start('Get threads');

      Thread.find(query).select(thread_fields).setOptions({lean: true })
          .exec(function(err, docs){
        if (!err) {
          env.response.data.threads = docs.map(function(doc) {
            if (doc.cache.real.first_user) {
              env.data.users.push(doc.cache.real.first_user);
            }
            if (doc.cache.real.last_user) {
              env.data.users.push(doc.cache.real.last_user);
            }
            if (env.session.hb) {
              doc.cache.real = doc.cache.hb;
            }
            return doc;
          });
        }
        env.extras.puncher.stop(_.isArray(docs) ? { count: docs.length} : null);
        callback(err);
      });
    }
  ], next);
};


// fetch forums for breadcrumbs build
// prepare buand head meta
nodeca.filters.after('@', function (params, next) {
  var env = this;
  var data = this.response.data;
  var forum = this.data.section;

  // prepare page title
  data.head.title = forum.title;

  // prepare forum info
  data.forum = {
    id: forum.id,
    title: forum.title,
    description: forum.description,
  };
  if (this.session.hb) {
    data.forum['thread_count'] = forum.cache.hb.thread_count;
  }
  else {
    data.forum['thread_count'] = forum.cache.real.thread_count;
  }

  var query = { _id: { $in: forum.parent_list } };
  var fields = { '_id' : 1, 'id' : 1, 'title' : 1 };

  env.extras.puncher.start('Build breadcrumbs');

  Section.find(query).select(fields).sort({ 'level':1 })
      .setOptions({lean:true}).exec(function(err, docs){
    if (err) {
      next(err);
      return;
    }
    docs.push(forum);
    data.widgets.breadcrumbs = forum_breadcrumbs(env, docs);

    env.extras.puncher.stop();

    next();
  });
});
