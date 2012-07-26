"use strict";

/*global nodeca, _*/

/*
 * This seed create data for demo forum:
 *   3 category, each category contain 10 forums
 *   first forum contain 200 threads, all others only one
 *   first thread in first thread contain 100 post, all others only one
 *
 */

var NLib = require('nlib');

var Async = NLib.Vendor.Async;
var Faker = NLib.Vendor.Faker;


var CATEGORY_COUNT = 3;
var FORUM_COUNT  = 10;
var THREAD_COUNT_IN_BIG_FORUM  = 200;
var POST_COUNT_IN_BIG_THREAD  = 100;
var USER_COUNT = 200;
var MAX_MODERATOR_COUNT = 4;
var MAX_SUB_FORUM_COUNT = 10;

var CATEGORY_ID_SHIFT = 3;
var FORUM_ID_SHIFT = CATEGORY_ID_SHIFT + CATEGORY_COUNT;
var DISPLAY_ORDER_SHIFT = 2;
var THREAD_ID_SHIFT = 2;
var POST_ID_SHIFT = 2;
var USER_ID_SHIFT = 2;

// extend Faker
// add numeric id generator
Faker.Incrementer = {
  category_shift: CATEGORY_ID_SHIFT,
  forum_shift: FORUM_ID_SHIFT,
  display_order_shift: DISPLAY_ORDER_SHIFT,
  thread_shift: THREAD_ID_SHIFT,
  post_shift: POST_ID_SHIFT,
  user_shift: USER_ID_SHIFT
};

Faker.Incrementer.next = function(type){
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

Faker.users = [];

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// add helpers for categorys,forums, threads and posts
Faker.Helpers.category = function (){
  return {
    title: capitalize(Faker.Lorem.sentence(1)),
    description: capitalize(Faker.Lorem.sentence()),

    display_order: Faker.Incrementer.next('display_order'),
    level: 0,
    id: Faker.Incrementer.next('category'),
    is_category: true
  };
};

Faker.Helpers.forum = function (parent){
  var moderator_id_list = [];
  var moderator_list = [];
  var moderator;

  var moderator_count = Faker.Helpers.randomNumber(MAX_MODERATOR_COUNT+1);
  for (var i=0; i < moderator_count; i++) {
    moderator = Faker.users[Faker.Helpers.randomNumber(USER_COUNT)];
    moderator_list.push(moderator);
    moderator_id_list.push(moderator.id);
  }
 
  return {
    title: capitalize(Faker.Lorem.sentence(1)),
    description: capitalize(Faker.Lorem.sentence()),

    id: Faker.Incrementer.next('forum'),

    parent: parent._id,
    parent_list: parent.parent_list.slice().concat([parent._id]),

    parent_id: parent.id,
    parent_id_list: parent.parent_id_list.slice().concat([parent.id]),

    display_order: Faker.Incrementer.next('display_order'),

    level:  parent.level + 1,

    moderator_id_list: _.uniq(moderator_id_list),
    moderator_list: _.uniq(moderator_list),

    cache: {
      real: {},
    }
  };
};

Faker.Helpers.thread = function (forum){
  return {
    title: capitalize(Faker.Lorem.sentence(1)),

    id: Faker.Incrementer.next('thread'),

    // Stub. This constants should be defined globally
    state:  0,
    forum: forum._id,
    forum_id: forum.id,

    _seo_desc: capitalize(Faker.Lorem.sentence(5)),
    _views_count: Faker.Helpers.randomNumber(1000)
  };
};

Faker.Helpers.post = function (thread){
  return {
    text: capitalize(Faker.Lorem.paragraph()),
    fmt:  'txt',

    id: Faker.Incrementer.next('post'),

    // Stub. This constants should be defined globally
    state: 0,

    thread: thread._id,

    forum: thread.forum._id,

    thread_id: thread.id,
    forum_id: thread.forum_id,

    user: Faker.users[Faker.Helpers.randomNumber(USER_COUNT)],

    ts: new Date()
    // ToDo user
  };
};


Faker.Helpers.user = function (){
  return {
    id          : Faker.Incrementer.next('user'),
    first_name  : Faker.Name.firstName(),
    last_name   : Faker.Name.lastName(),
    nick        : Faker.Internet.userName(),

    email       : Faker.Internet.email(),
    
    joined_ts   : new Date(),
    
    cache       : {
      userpic_version   : Faker.Helpers.randomNumber(15),
      avatar_version    : Faker.Helpers.randomNumber(15)
    }
    // ToDo add groups
  };
};

var Category = nodeca.models.forum.Section;
var Forum    = nodeca.models.forum.Section;
var Thread   = nodeca.models.forum.Thread;
var Post     = nodeca.models.forum.Post;
var User     = nodeca.models.users.User;

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
      thread.cache.real.post_count = post_count;

      thread.cache.real.first_post = first_post._id;
      thread.cache.real.first_post_id = first_post.id;
      thread.cache.real.first_ts = first_post.ts;
      thread.cache.real.first_user = first_post.user;

      thread.cache.real.last_post = last_post._id;
      thread.cache.real.last_post_id = last_post.id;
      thread.cache.real.last_ts = last_post.ts;
      thread.cache.real.last_user = last_post.user;

      _.extend(thread.cache.hb, thread.cache.real);

      thread.save(cb);
    }
  ], function(err) {
    callback(err, thread);
  });
};

var create_forum = function(category, sub_forum_deep, callback){
  var last_thread;
  var post_count = 0;
  var thread_count;

  var sub_forum_list = [];
  var sub_forum_id_list = [];

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
          post_count += thread.cache.real.post_count;
          next_thread();
        });
      }, cb);
    },

    // add sub-forums
    function(cb) {
      if (!sub_forum_deep || Faker.Helpers.randomNumber(3) === 2) {
        cb();
        return;
      }
      var sub_forum_count = Faker.Helpers.randomNumber(MAX_SUB_FORUM_COUNT);
      Async.forEach( _.range(sub_forum_count), function (current_forum, next_forum) {
        create_forum(forum, sub_forum_deep-1, function(err, sub_forum){
          sub_forum_list.push(sub_forum._id);
          sub_forum_id_list.push(sub_forum.id);
          next_forum(err);
        });
      }, cb);
    },

    // update forum dependent info
    function(cb){
      forum.cache.real.last_thread = last_thread._id;
      forum.cache.real.last_thread_id = last_thread.id;
      forum.cache.real.last_thread_title = last_thread.title;

      var thread_real = last_thread.cache.real;
      forum.cache.real.last_post = thread_real.last_post;
      forum.cache.real.last_post_id = thread_real.last_post_id;
      forum.cache.real.last_ts = thread_real.last_ts;
      forum.cache.real.last_user = thread_real.last_user;

      forum.cache.real.post_count = post_count;
      forum.cache.real.thread_count = thread_count;
      _.extend(forum.cache.hb, forum.cache.real);

      forum.save(cb);
    }
  ], function(err) {
    callback(err, forum);
  });
};


var create_categories = function(callback) {
  Async.forEachSeries(_.range(CATEGORY_COUNT), function(current_category, next_category) {
    var forum_list = [];
    var forum_id_list = [];

    var category = new Category(Faker.Helpers.category());

    category.save(function(err) {
    // create forums
      Async.forEach( _.range(FORUM_COUNT), function (current_forum, next_forum) {
        create_forum(category, 3, function(err, forum){
          forum_list.push(forum._id);
          forum_id_list.push(forum.id);
          next_forum(err);
        });
      }, next_category);
    });
  }, function(err){
    callback(err);
  });
};

module.exports = function(callback) {
  Async.forEachSeries(_.range(USER_COUNT), function(current_user, next_user) {
    var user = new User(Faker.Helpers.user());
    user.setPass(Faker.Lorem.words(1)[0]);
    user.save(next_user);

    // add user to store
    Faker.users.push(user);
  }, function(err){
    create_categories(callback);
  });
};
