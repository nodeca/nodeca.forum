"use strict";

/*global nodeca*/

var NLib = require('nlib');

var Async = NLib.Vendor.Async;

var models = nodeca.models;

module.exports.up = function(cb) {

  var category = new models.forum.Section();
  var forum    = new models.forum.Section();
  var thread   = new models.forum.Thread();
  var post     = new models.forum.Post();

  Async.waterfall([
    // create basic section record
    function(callback){
      category.title = 'Demo category';
      category.description = 'Description of demo category';

      category.id = 1;

      category.save(function (err) {
        callback(err);
      });
    },

    // create basic forum record
    function(callback){
      forum.title = 'Demo forum';
      forum.description = 'Description for demo forum';

      forum.id = 2;

      forum.parent = category; //embedded
      forum.parent_id = category.id;

      forum.parent_list.push(category); //embedded
      forum.parent_id_list.push(category.id);

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

      thread.forum_id = forum.id;
      thread.forum = forum; //embedded

      thread.save(function (err) {
        callback(err);
      });
    },

    // create basic post record
    function(callback){
      post.text = 'Welcome to nodeca forum';
      post.fmt =  'txt';
      post.id = 1;

      // Stub. This constants should be defined globally
      post.state = 0;

      post.thread_id = thread.id;
      post.thread = thread; //embedded

      post.forum_id = forum.id;
      post.forum = forum; //embedded

      post.save(function (err) {
        callback(err);
      });
    },

    // update category dependent info
    function(callback){
      category.child_list.push(forum); //embedded
      category.child_id_list.push(forum.id);

      category.save(function (err) {
        callback(err);
      });
    },

    // update forum dependent info
    function(callback){
      forum.last_post =  post; //embedded
      forum.last_post_id = post.id;

      forum.last_thread = thread; //embedded
      forum.last_thread_id = thread.id;

      forum.save(function (err) {
        callback(err);
      });
    },

    // update thread dependent info
    function(callback){
      thread.post_count +=1;

      thread.first_post = thread.last_post = post; //embedded
      thread.first_post_id = thread.last_post_id = post.id;

      thread.save(function (err) {
        callback(err);
      });
    }
  ], function (err){
    cb(err);
  });

};
