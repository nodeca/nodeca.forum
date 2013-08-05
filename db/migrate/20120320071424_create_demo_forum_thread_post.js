"use strict";


var _     = require('lodash');
var async = require('async');

// thread and post statuses
var statuses = require('../../server/forum/thread/_statuses.js');

module.exports.up = function (N, cb) {
  var models = N.models;

  var category = new models.forum.Section();
  var forum    = new models.forum.Section();
  var thread   = new models.forum.Thread();
  var post     = new models.forum.Post();

  var user     = new models.users.User();
  var auth     = new models.users.AuthLink();

  async.series([
    // create admin user
    function (callback) {
      // get administrators group Id
      models.users.UserGroup.findOne({ short_name: 'administrators' })
          .exec(function(err, group) {
        if (err) {
          callback(err);
          return;
        }
        user.id = 1;
        user.nick = 'admin';
        user.email = 'admin@localhost';
        user.joined_ts = new Date;
        user.post_count = 1;
        user.usergroups = [group];

        user.save(callback);
      });
    },

    // create auth link
    function (callback) {
      var provider = auth.providers.create({
        'type': 'plain',
        'email': 'admin@example.com'
      });

      provider.setPass('admin');

      auth.user_id = user._id;
      auth.providers.push(provider);

      auth.save(callback);
    },

    // create basic category record
    function (callback) {
      category.title = 'Demo category';
      category.description = 'Description of demo category';

      category.id = 1;
      category.is_category = true;
      category.display_order = 0;

      category.save(callback);
    },

    // create basic forum record
    function (callback) {
      forum.title = 'Demo forum';
      forum.description = 'Description for demo forum';

      forum.id = 2;
      forum.parent = category._id;
      forum.display_order = category.display_order + 1;

      forum.save(callback);
    },

    // create basic thread record
    function (callback) {
      thread.title = 'Demo post';
      thread.id = 1;

      thread.st = statuses.thread.OPEN;

      thread.forum_id = forum.id;
      thread.forum = forum._id;

      thread.save(callback);
    },

    // create basic post record
    function (callback) {
      post.text = 'Welcome to nodeca forum';
      post.fmt =  'txt';
      post.id = 1;
      post.ts = new Date;

      // Stub. This constants should be defined globally
      post.st = statuses.post.VISIBLE;

      post.thread_id = thread.id;
      post.thread = thread._id;

      post.forum_id = forum.id;
      post.forum = forum._id;

      post.user = user;

      post.save(callback);
    },

    // update forum dependent info
    function (callback) {
      forum.cache.real.last_post = post._id;
      forum.cache.real.last_post_id = post.id;
      forum.cache.real.last_user = user;
      forum.cache.real.last_ts = post.ts;

      forum.cache.real.last_thread = thread._id;
      forum.cache.real.last_thread_id = thread.id;
      forum.cache.real.last_thread_title = thread.title;

      forum.cache.real.thread_count = 1;
      forum.cache.real.post_count = 1;

      _.extend(forum.cache.hb, forum.cache.real);
      forum.save(callback);
    },

    // update thread dependent info
    function (callback) {
      thread.cache.real.post_count = 1;

      thread.cache.real.first_post = post._id;
      thread.cache.real.last_post = post._id;

      thread.cache.real.first_post_id = post.id;
      thread.cache.real.last_post_id = post.id;

      thread.cache.real.first_user = user;
      thread.cache.real.last_user = user;

      thread.cache.real.first_ts = post.ts;
      thread.cache.real.last_ts = post.ts;

      _.extend(thread.cache.hb, thread.cache.real);
      thread.save(callback);
    }
  ], cb);
};
