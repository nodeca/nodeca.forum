"use strict";


var _     = require('lodash');
var async = require('async');

// topic and post statuses
var statuses = require('../../server/forum/topic/_statuses.js');

module.exports.up = function (N, cb) {
  var models = N.models;

  var category = new models.forum.Section();
  var forum    = new models.forum.Section();
  var topic   = new models.forum.Topic();
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

    // create basic topic record
    function (callback) {
      topic.title = 'Demo post';
      topic.id = 1;

      topic.st = statuses.topic.OPEN;

      topic.forum_id = forum.id;
      topic.forum = forum._id;

      topic.save(callback);
    },

    // create basic post record
    function (callback) {
      post.text = 'Welcome to nodeca forum';
      post.fmt =  'txt';
      post.ts = new Date;

      // Stub. This constants should be defined globally
      post.st = statuses.post.VISIBLE;

      post.topic = topic._id;
      post.forum = forum._id;
      post.user = user;

      post.save(callback);
    },

    // update forum dependent info
    function (callback) {
      forum.cache.real.last_post = post._id;
      forum.cache.real.last_user = user;
      forum.cache.real.last_ts = post.ts;

      forum.cache.real.last_topic = topic._id;
      forum.cache.real.last_topic_id = topic.id;
      forum.cache.real.last_topic_title = topic.title;

      forum.cache.real.topic_count = 1;
      forum.cache.real.post_count = 1;

      _.extend(forum.cache.hb, forum.cache.real);
      forum.save(callback);
    },

    // update topic dependent info
    function (callback) {
      topic.cache.real.post_count = 1;

      topic.cache.real.first_post = post._id;
      topic.cache.real.last_post = post._id;

      topic.cache.real.first_user = user;
      topic.cache.real.last_user = user;

      topic.cache.real.first_ts = post.ts;
      topic.cache.real.last_ts = post.ts;

      _.extend(topic.cache.hb, topic.cache.real);
      topic.save(callback);
    }
  ], cb);
};
