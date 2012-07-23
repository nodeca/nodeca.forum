"use strict";

/*global nodeca, _*/

var NLib = require('nlib');
var Async = NLib.Vendor.Async;

var Section = nodeca.models.forum.Section;
var Thread = nodeca.models.forum.Thread;

var forum_breadcrumbs = require('../../lib/breadcrumbs.js').forum;


// prefetch forum to simplify permisson check
nodeca.filters.before('@', function (params, next) {
  var env = this;

  env.extras.puncher.start('Forum info prefetch');

  Section.findOne({id: params.id}).setOptions({lean: true }).exec(function(err, doc) {
    if (!err) {
      env.data.section = doc;
    }
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
      var root = env.data.section._id;
      var deep = env.data.section.level + 2; // need two next levels
      Section.build_tree(env, root, deep, function(err) {
        env.extras.puncher.stop();
        callback(err);
      });
    },
    function (callback) {
      env.data.users = env.data.users || [];

      // fetch and prepare threads
      var query = {forum_id: params.id};

      var fields = [
        '_id', 'id', 'title', 'prefix', 'forum_id', 'cache'
      ];

      env.extras.puncher.start('Get threads');
      Thread.find(query).select(fields.join(' ')).setOptions({lean: true })
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
    id: params.id,
    title: forum.title,
    description: forum.description,
  };
  if (this.session.hb) {
    data.forum['thread_count'] = forum.cache.hb.thread_count;
  }
  else {
    data.forum['thread_count'] = forum.cache.real.thread_count;
  }

  var query = {_id: {$in: forum.parent_list}};
  var fields = {
    '_id' : 1,
    'id' : 1,
    'title' : 1
  };
  env.extras.puncher.start('Build breadcrumbs');
  Section.find(query).select(fields)
      .setOptions({lean:true}).exec(function(err, docs){
    data.widgets.breadcrumbs = forum_breadcrumbs(env, docs);

    env.extras.puncher.stop();
    next();
  });
});
