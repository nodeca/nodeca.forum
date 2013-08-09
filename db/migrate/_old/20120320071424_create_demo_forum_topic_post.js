"use strict";


var _     = require('lodash');
var async = require('async');

// topic and post statuses
var statuses = require('../../server/forum/topic/_statuses.js');

module.exports.up = function (N, cb) {
  var models = N.models;

  var category = new models.forum.Section();
  var section    = new models.forum.Section();
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

    // create basic section record
    function (callback) {
      section.title = 'Demo forum';
      section.description = 'Description for demo forum';

      section.id = 2;
      section.parent = category._id;
      section.display_order = category.display_order + 1;

      section.save(callback);
    },

    // create basic topic record
    function (callback) {
      topic.title = 'Demo post';
      topic.hid = 1;

      topic.st = statuses.topic.OPEN;

      topic.section_id = section.id;
      topic.section = section._id;

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
      post.section = section._id;
      post.user = user;

      post.save(callback);
    },

    // update section dependent info
    function (callback) {
      section.cache.real.last_post = post._id;
      section.cache.real.last_user = user;
      section.cache.real.last_ts = post.ts;

      section.cache.real.last_topic = topic._id;
      section.cache.real.last_topic_hid = topic.hid;
      section.cache.real.last_topic_title = topic.title;

      section.cache.real.topic_count = 1;
      section.cache.real.post_count = 1;

      _.extend(section.cache.hb, section.cache.real);
      section.save(callback);
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
