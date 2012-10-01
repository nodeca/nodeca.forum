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

  var user     = new models.users.User();

  Async.series([
    // create admin user
    
    function(callback){
      user.id = 1;
      user.nick = 'admin';
      user.email = 'admin@localhost';
      user.joined_ts = new Date;
      user._post_count = 1;

      // ToDo add to admin group
      user.save(callback);
    },
   
    // create basic category record
    function(callback){
      category.title = 'Demo category';
      category.description = 'Description of demo category';

      category.id = 1;
      category.is_category = true;
      category.display_order = 0;

      category.save(callback);
    },

    // create basic forum record
    function(callback){
      forum.title = 'Demo forum';
      forum.description = 'Description for demo forum';

      forum.id = 2;

      forum.parent = category._id;
      forum.parent_id = category.id;

      forum.parent_list.push(category._id);
      forum.parent_id_list.push(category.id);

      forum.level = 1;

      forum.display_order = category.display_order + 1;
      forum.save(callback);
    },

    // create basic thread record
    function(callback){
      thread.title = 'Demo post';
      thread.id = 1;

      // Stub. This constants should be defined globally
      thread.state = 0;

      thread.forum_id = forum.id;
      thread.forum = forum._id;

      thread.save(callback);
    },

    // create basic post record
    function(callback){
      post.text = 'Welcome to nodeca forum';
      post.fmt =  'txt';
      post.id = 1;
      post.ts = new Date;

      // Stub. This constants should be defined globally
      post.state = 0;

      post.thread_id = thread.id;
      post.thread = thread._id;

      post.forum_id = forum.id;
      post.forum = forum._id;

      post.user = user;

      post.save(callback);
    },

    // update forum dependent info
    function(callback){
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
    function(callback){
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
