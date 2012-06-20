"use strict";

/*global nodeca, _*/

var NLib = require('nlib');

var Async = NLib.Vendor.Async;

var models = nodeca.models;

module.exports.up = function(cb) {

  var category = new models.forum.Section();
  var forum    = new models.forum.Section();
  var thread   = new models.forum.Thread();
  var post     = new models.forum.Post();

  Async.waterfall([
    // create basic category record
    function(callback){
      category.title = 'Demo category';
      category.description = 'Description of demo category';

      category.id = 1;
      category.is_category = true;

      category.save(function (err) {
        callback(err);
      });
    },

    // create basic forum record
    function(callback){
      forum.title = 'Demo forum';
      forum.description = 'Description for demo forum';

      forum.id = 2;

      forum.parent = category._id;
      forum.cache.parent_id = category.id;

      forum.parent_list.push(category._id);
      forum.cache.parent_id_list.push(category.id);

      forum.save(function (err) {
        callback(err);
      });
    },

    // create basic thread record
    function(callback){
      thread.title = 'Demo post';
      thread.id = 1;

      // Stub. This constants should be defined globally
      thread.state = 0;

      thread.cache.forum_id = forum.id;
      thread.forum = forum._id;

      thread.save(function (err) {
        callback(err);
      });
    },

    // create basic post record
    function(callback){
      post.text = 'Welcome to nodeca forum';
      post.fmt =  'txt';
      post.id = 1;
      post.ts = new Date;

      // Stub. This constants should be defined globally
      post.state = 0;

      post.cache.thread_id = thread.id;
      post.thread = thread._id;

      post.cache.forum_id = forum.id;
      post.forum = forum._id;

      post.save(function (err) {
        callback(err);
      });
    },

    // update category dependent info
    function(callback){
      category.child_list.push(forum._id);
      category.cache.child_id_list.push(forum.id);

      category.save(function (err) {
        callback(err);
      });
    },

    // update forum dependent info
    function(callback){
      forum.cache.counters.last_post = post._id;
      forum.cache.counters.last_post_id = post.id;
      forum.cache.counters.last_ts = post.ts;

      forum.cache.counters.last_thread = thread._id;
      forum.cache.counters.last_thread_id = thread.id;
      forum.cache.counters.last_thread_title = thread.title;

      forum.cache.counters.thread_count = 1;
      forum.cache.counters.post_count = 1;

      _.extend(forum.cache.hb_counters, forum.cache.counters);
      forum.save(function (err) {
        callback(err);
      });
    },

    // update thread dependent info
    function(callback){
      thread.cache.counters.post_count = 1;

      thread.cache.counters.first_post = post._id;
      thread.cache.counters.last_post = post._id;

      thread.cache.counters.first_post_id = post.id;
      thread.cache.counters.last_post_id = post.id;

      thread.cache.counters.first_ts = post.ts;
      thread.cache.counters.last_ts = post.ts;

      _.extend(thread.cache.hb_counters, thread.cache.counters);
      thread.save(function (err) {
        callback(err);
      });
    }
  ], function (err){
    cb(err);
  });

};
