"use strict";

/*global nodeca*/

/*
 * This seed create data for demo forum:
 *   3 category, each category contain 10 forums
 *   first forum contain 200 threads, all others only one
 *   first thread in first thread contain 100 post, all others only one
 *
 */

var NLib = require('nlib');

var _ = NLib.Vendor.Underscore;
var Async = NLib.Vendor.Async;
var Faker = NLib.Vendor.Faker;


var CATEGORY_COUNT = 3;
var FORUM_COUNT  = 10;
var THREAD_COUNT_IN_BIG_FORUM  = 200;
var POST_COUNT_IN_BIG_THREAD  = 100;

var CATEGORY_ID_SHIFT = 3;
var FORUM_ID_SHIFT = CATEGORY_ID_SHIFT + CATEGORY_COUNT;
var THREAD_ID_SHIFT = 2;
var POST_ID_SHIFT = 2;

// extend Faker
// add numeric id generator
Faker.Ids = {
  category_shift: CATEGORY_ID_SHIFT,
  forum_shift: FORUM_ID_SHIFT,
  thread_shift: THREAD_ID_SHIFT,
  post_shift: POST_ID_SHIFT
};

Faker.Ids.next = function(type){
  var last_id_prop_name = type + '_last_id';
  if (!this[last_id_prop_name]) {
    var shift_prop_name = type + '_shift';
    if (!this[shift_prop_name]) {
      this[shift_prop_name] = 0;
    }
    this[last_id_prop_name] = this[shift_prop_name];
  }
  this[last_id_prop_name]++;
  return this[last_id_prop_name];
};

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// add helpers for categorys,forums, threads and posts
Faker.Helpers.category = function (){
  return {
    title: capitalize(Faker.Lorem.sentence()),
    description: capitalize(Faker.Lorem.sentence()),

    id: Faker.Ids.next('category'),
    is_category: true
  };
};

Faker.Helpers.forum = function (category){
  return {
    title: capitalize(Faker.Lorem.sentence()),
    description: capitalize(Faker.Lorem.sentence()),

    id: Faker.Ids.next('forum'),

    parent: category._id,
    parent_id: category.id,

    parent_list: [category._id],
    parent_id_list: [category.id]
  };
};

Faker.Helpers.thread = function (forum){
  return {
    title: capitalize(Faker.Lorem.sentence()),

    id: Faker.Ids.next('thread'),

    // Stub. This constants should be defined globally
    state:  0,

    forum_id: forum.id,
    forum: forum._id
  };
};

Faker.Helpers.post = function (thread){
  return {
    text: capitalize(Faker.Lorem.paragraph()),
    fmt:  'txt',

    id: Faker.Ids.next('post'),

    // Stub. This constants should be defined globally
    state: 0,

    thread_id: thread.id,
    thread: thread._id,

    forum_id: thread.forum_id,
    forum: thread.forum._id,

    ts: new Date()
    // ToDo user
  };
};

var Category = nodeca.models.forum.Section;
var Forum    = nodeca.models.forum.Section;
var Thread   = nodeca.models.forum.Thread;
var Post     = nodeca.models.forum.Post;

var is_big_thread = true;
var is_big_forum = true;

var create_post = function(thread, callback) {
  var post = new Post(Faker.Helpers.post(thread));

  post.save(callback);
};

var create_thread = function(forum, callback) {
  var first_post;
  var last_post;
  var post_count;

  if (is_big_thread) {
    is_big_thread = false;
    post_count = POST_COUNT_IN_BIG_THREAD;
  } else{
    post_count = 1;
  }

  var thread = new Thread(Faker.Helpers.thread(forum));

  Async.series([
    function(cb){
      thread.save(cb);
    },
    // create posts
    function(cb){
      Async.forEach(_.range(post_count), function (current_post, next_post) {
        create_post(thread, function(err, post){
          if (!first_post){
            first_post = post;
          }
          last_post = post;
          next_post();
        });
      }, cb);
    },
    // update thread
    function(cb){
      thread.post_count = post_count;

      thread.first_post = first_post._id;
      thread.first_post_id = first_post.id;
      thread.first_ts = first_post.ts;

      thread.last_post = last_post._id;
      thread.last_post_id = last_post.id;
      thread.last_ts = last_post.ts;

      thread.save(cb);
    }
  ], function(err) {
    callback(err, thread);
  });
};

var create_forum = function(category, callback){
  var last_thread;
  var thread_count;

  if (is_big_forum) {
    is_big_forum = false;
    thread_count = THREAD_COUNT_IN_BIG_FORUM;
  } else{
    thread_count = 1;
  }

  var forum = new Forum(Faker.Helpers.forum(category));

  Async.series([
    function(cb){
      forum.save(cb);
    },
    // create threads
    function(cb){
      Async.forEach(_.range(thread_count), function (current_thread, next_thread) {
        create_thread(forum, function(err, thread){
          last_thread = thread;
          next_thread();
        });
      }, cb);
    },
    // update forum dependent info
    function(cb){
      forum.last_thread = last_thread._id;
      forum.last_thread_id = last_thread.id;

      forum.last_post = last_thread.last_post;
      forum.last_post_id = last_thread.last_post_id;
      forum.last_ts = last_thread.last_ts;

      forum.save(cb);
    }
  ], function(err) {
    callback(err, forum);
  });
};

module.exports = function(callback) {
  Async.forEachSeries(_.range(CATEGORY_COUNT), function(current_category, next_category) {
    var forum_list = [];
    var forum_id_list = [];

    var category = new Category(Faker.Helpers.category());

    Async.series([
      function(cb){
        category.save(cb);
      },
      // create forums
      function(cb){
        Async.forEach( _.range(FORUM_COUNT), function (current_forum, next_forum) {
          create_forum(category, function(err, forum){
            forum_list.push(forum._id);
            forum_id_list.push(forum.id);
            next_forum(err);
          });
        }, cb);
      },
      // update parent category dependent info
      function(cb){
        category.child_list = forum_list;
        category.child_id_list = forum_id_list;

        category.save(cb);
      }
    ], next_category);
  }, function(err){
    callback(err);
  });
};
