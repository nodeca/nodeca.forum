"use strict";

/*global nodeca*/

var NLib = require('nlib');

var _ = NLib.Vendor.Underscore;
var Async = NLib.Vendor.Async;
var Faker = NLib.Vendor.Faker;


var CATEGORIES_COUNT = 3;
var FORUMS_COUNT  = 10;
var THREADS_COUNT  = 200
var POSTS_COUNT  = 100;

var CATEGORY_ID_SHIFT = 3;
var FORUM_ID_SHIFT = CATEGORY_ID_SHIFT + CATEGORIES_COUNT;
var THREAD_ID_SHIFT = 2;
var POST_ID_SHIFT = 2;

// extend Faker
Faker.Ids = {
  category_shift: CATEGORY_ID_SHIFT,
  forum_shift: FORUM_ID_SHIFT,
  thread_shift: THREAD_ID_SHIFT,
  post_shift: POST_ID_SHIFT
}

Faker.Ids.next = function(type){
  var prop_name = type + '_last_id';
  if (!this[prop_name]) {
    if (!this[type + '_shift']) {
      this[type + '_shift'] = 0;
    }
    this[prop_name] = this[type + '_shift'];
  }
  return ++this[prop_name]
}

Faker.Helpers.category = function (){
  return {
    title: Faker.Lorem.words(),
    description: Faker.Lorem.sentence(),

    id: Faker.Ids.next('category')
  };
};

Faker.Helpers.forum = function (category){
  return {
    title: Faker.Lorem.words(),
    description: Faker.Lorem.sentence(),

    id: Faker.Ids.next('forum'),

    parent: category, //embedded
    parent_id: category.id,

    parent_list: [category], //embedded
    parent_id_list: [category.id]
  };
};

Faker.Helpers.thread = function (forum){
  return {
    title: Faker.Lorem.words(),

    id: Faker.Ids.next('thread'),

    // Stub. This constants should be defined globally
    state:  0,

    forum_id: forum.id,
    forum: forum //embedded
  };
};

Faker.Helpers.post = function (thread){

  return {
    text: Faker.Lorem.paragraph(),
    fmt:  'txt',

    id: Faker.Ids.next('post'),

    // Stub. This constants should be defined globally
    state: 0,

    thread_id: thread.id,
    thread: thread, //embedded

    forum_id: thread.forum_id,
    forum: thread.forum
  };
};

var category_model = nodeca.models.forum.section;
var forum_model = nodeca.models.forum.section;
var thread_model = nodeca.models.forum.thread;
var post_model = nodeca.models.forum.post;

var create_post = function(thread, callback) {
  var post = new post_model(Faker.Helpers.post(thread));

  post.save(callback);
}

var create_thread = function(forum, callback) {
  var first_post;
  var last_post;

  var thread = new thread_model(Faker.Helpers.thread(forum));
  Async.series([
    function(cb){
      thread.save(cb);
    },
    // create posts
    function(cb){
      Async.forEach(_.range(POSTS_COUNT), function (post, next_post) {
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
      thread.post_count = POSTS_COUNT;

      thread.first_post = first_post;
      thread.first_post_id = first_post.id;
      thread.first_ts = first_post.ts;

      thread.last_post = last_post;
      thread.last_post_id = last_post.id;
      thread.last_ts = last_post.ts;

      thread.save(cb);
    }
  ], function(err) {
    callback(err, thread);
  });
}

var create_forum = function(category, callback){
  var last_thread;

  var forum = new forum_model(Faker.Helpers.forum(category));

  Async.series([
    function(cb){
      forum.save(cb);
    },
    // create posts
    function(cb){
      Async.forEach(_.range(THREADS_COUNT), function (thread, next_thread) {
        create_thread(forum, function(err, thread){
          last_thread = thread;
          next_thread();
        });
      }, cb);
    },
    // update forum dependent info
    function(cb){
      forum.last_thread = last_thread;
      forum.last_thread_is = last_thread.id;

      forum.last_post = last_thread.last_post;
      forum.last_post_id = last_thread.last_post_id;
      forum.last_ts = last_thread.last_post.ts;

      forum.save(cb);
    }
  ], function(err) {
    callback(err, forum);
  });
}

module.exports.up = function(callback) {
  Async.forEachSeries(_.range(CATEGORIES_COUNT), function(category, next_category) {
    var category = new category_model(Faker.Helpers.category());
    var forum_list = [];
    var forum_id_list = [];

    Async.series([
      function(cb){
        category.save(cb);
      },
      // create forums
      function(cb){
        Async.forEach( _.range(FORUMS_COUNT), function (forum, next_forum) {
          create_forum(category, function(err, forum){
            forum_list.push(forum);
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
}
