"use strict";


/*
 * This seed create data for demo forum:
 *   3 category, each category contain 10 forums
 *   last forum in 3rd category is empty
 *   first forum contain 200 topics, all others only one
 *   first topic in first topic contain 100 post, all others only one
 *
 */

var _         = require('lodash');
var async     = require('async');
var Charlatan = require('charlatan');

// topic and post statuses
var statuses = require('../../server/forum/topic/_statuses.js');

var Category;
var Forum;
var Topic;
var Post;
var User;
var UserGroup;


var CATEGORY_COUNT = 3;
var FORUM_COUNT  = 10;
var SUB_FORUM_DEEP = 1;
var TOPIC_COUNT_IN_BIG_FORUM  = 200;
var POST_COUNT_IN_BIG_TOPIC  = 100;
var USER_COUNT = 200;
var MAX_MODERATOR_COUNT = 3;
var MAX_SUB_FORUM_COUNT = 3;

var CATEGORY_ID_SHIFT = 3;
var FORUM_HID_SHIFT = CATEGORY_ID_SHIFT + CATEGORY_COUNT;
var DISPLAY_ORDER_SHIFT = 2;
var TOPIC_HID_SHIFT = 2;
var USER_HID_SHIFT = 2;

// cache usergroups ids
var usergroups_cache = {};

// extend Charlatan
// add numeric id generator
Charlatan.Incrementer = {
  category_shift: CATEGORY_ID_SHIFT,
  forum_shift: FORUM_HID_SHIFT,
  display_order_shift: DISPLAY_ORDER_SHIFT,
  topic_shift: TOPIC_HID_SHIFT,
  user_shift: USER_HID_SHIFT
};

Charlatan.Incrementer.next = function (type) {
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

Charlatan.users = [];

// add helpers for categorys,forums, topics and posts
Charlatan.Helpers.category = function () {
  return {
    title: Charlatan.Lorem.sentence(Charlatan.Helpers.rand(5, 3)).slice(0, -1),
    description: Charlatan.Lorem.sentence(),

    display_order: Charlatan.Incrementer.next('display_order'),
    id: Charlatan.Incrementer.next('category'),
    is_category: true
  };
};

Charlatan.Helpers.forum = function (parent) {
  return {
    title: Charlatan.Lorem.sentence(Charlatan.Helpers.rand(5, 3)).slice(0, -1),
    description: Charlatan.Lorem.sentence(),

    id: Charlatan.Incrementer.next('forum'),

    parent: parent._id,
    display_order: Charlatan.Incrementer.next('display_order'),

    cache: {
      real: {}
    }
  };
};

Charlatan.Helpers.topic = function (forum) {
  return {
    title: Charlatan.Lorem.sentence().slice(0, -1),

    hid: Charlatan.Incrementer.next('topic'),

    st: statuses.topic.OPEN,
    forum: forum._id,

    views_count: Charlatan.Helpers.rand(1000)
  };
};

Charlatan.Helpers.post = function (topic) {
  var ts =  new Date(2010, 0, 0);
  return {
    text: Charlatan.Lorem.paragraphs(Charlatan.Helpers.rand(5, 1)).join(' '),
    fmt:  'txt',

    st: statuses.post.VISIBLE,
    topic: topic._id,
    forum: topic.forum,

    user: Charlatan.users[Charlatan.Helpers.rand(USER_COUNT)],

    ts: ts
    // ToDo user
  };
};


Charlatan.Helpers.user = function () {
  var nick = Charlatan.Internet.userName();
  var first_name = Charlatan.Name.firstName();
  var last_name = Charlatan.Name.lastName();
  return {
    id          : Charlatan.Incrementer.next('user'),
    first_name  : first_name,
    last_name   : last_name,
    nick        : nick,

    _uname      : first_name + ' (' + nick + ') ' + last_name,
    _uname_short: nick,

    email       : Charlatan.Internet.email(),

    joined_ts   : new Date()

    // ToDo add groups
  };
};

var is_big_topic = true;
var is_big_forum = true;


var create_post = function (topic, callback) {
  var post = new Post(Charlatan.Helpers.post(topic));

  post.save(function (err, post) {
    if (err) {
      callback(err);
      return;
    }
    var update = { $inc: { post_count: 1 }};
    User.update({ _id: post.user }, update, function (err) {
      callback(err, post);
    });
  });
};

var create_topic = function (forum, callback) {
  var first_post;
  var last_post;
  var post_count;

  if (is_big_topic) {
    is_big_topic = false;
    post_count = POST_COUNT_IN_BIG_TOPIC;
  } else {
    post_count = 1;
  }

  var topic = new Topic(Charlatan.Helpers.topic(forum));

  async.series([
    function (cb) {
      topic.save(cb);
    },
    // create posts
    function (cb) {
      async.forEachSeries(_.range(post_count), function (current_post, next_post) {
        create_post(topic, function (err, post) {
          if (err) {
            next_post(err);
            return;
          }

          if (!first_post) {
            first_post = post;
          }

          last_post = post;
          next_post();
        });
      }, cb);
    },
    // update topic
    function (cb) {
      topic.cache.real.post_count = post_count;

      topic.cache.real.first_post = first_post._id;
      topic.cache.real.first_ts = first_post.ts;
      topic.cache.real.first_user = first_post.user;

      topic.cache.real.last_post = last_post._id;
      topic.cache.real.last_ts = last_post.ts;
      topic.cache.real.last_user = last_post.user;

      _.extend(topic.cache.hb, topic.cache.real);

      topic.save(cb);
    }
  ], function (err) {
    callback(err, topic);
  });
};

var create_forum = function (category, sub_forum_deep, callback) {
  var last_topic;
  var post_count = 0;
  var topic_count;

  var sub_forum_list = [];
  var sub_forum_id_list = [];

  if (is_big_forum) {
    is_big_forum = false;
    topic_count = TOPIC_COUNT_IN_BIG_FORUM;
  } else {
    topic_count = 1;
  }

  var forum = new Forum(Charlatan.Helpers.forum(category));

  async.series([
    function (cb) {
      forum.save(cb);
    },

    // create topics
    function (cb) {
      async.forEachSeries(_.range(topic_count), function (current_topic, next_topic) {
        create_topic(forum, function (err, topic) {
          if (err) {
            next_topic(err);
            return;
          }
          last_topic = topic;
          post_count += topic.cache.real.post_count;
          next_topic();
        });
      }, cb);
    },

    // add sub-forums
    function (cb) {
      if (!sub_forum_deep || Charlatan.Helpers.rand(3) === 2) {
        cb();
        return;
      }
      var sub_forum_count = Charlatan.Helpers.rand(MAX_SUB_FORUM_COUNT);
      async.forEach(_.range(sub_forum_count), function (current_forum, next_forum) {
        create_forum(forum, sub_forum_deep - 1, function (err, sub_forum) {
          sub_forum_list.push(sub_forum._id);
          sub_forum_id_list.push(sub_forum.id);
          next_forum(err);
        });
      }, cb);
    },

    // update forum dependent info
    function (cb) {
      forum.cache.real.last_topic = last_topic._id;
      forum.cache.real.last_topic_hid = last_topic.hid;
      forum.cache.real.last_topic_title = last_topic.title;

      var topic_real = last_topic.cache.real;
      forum.cache.real.last_post = topic_real.last_post;
      forum.cache.real.last_ts = topic_real.last_ts;
      forum.cache.real.last_user = topic_real.last_user;

      forum.cache.real.post_count = post_count;
      forum.cache.real.topic_count = topic_count;
      _.extend(forum.cache.hb, forum.cache.real);

      forum.save(cb);
    },

    // add moderators
    function (cb) {
      var SectionModeratorStore = N.settings.getStore('section_moderator');

      if (!SectionModeratorStore) {
        cb('Settings store `section_moderator` is not registered.');
        return;
      }

      async.timesSeries(Charlatan.Helpers.rand(MAX_MODERATOR_COUNT), function (index, next) {
        var user = Charlatan.users[Charlatan.Helpers.rand(USER_COUNT)];

        SectionModeratorStore.set(
          { forum_mod_visible: { value: true } },
          { forum_id: forum._id, user_id: user._id },
          next
        );
      }, cb);
    },
  ], function (err) {
    callback(err, forum);
  });
};


var create_categories = function (callback) {
  var category;
  async.forEachSeries(_.range(CATEGORY_COUNT), function (current_category, next_category) {
    category = new Category(Charlatan.Helpers.category());

    category.save(function (err) {
      if (err) {
        next_category(err);
        return;
      }

      // create forums
      async.forEachSeries(_.range(FORUM_COUNT), function (current_forum, next_forum) {
        create_forum(category, SUB_FORUM_DEEP, function (err/*, forum */) {
          next_forum(err);
        });
      }, next_category);
    });
  }, function (err) {
    if (err) {
      callback(err);
      return;
    }
    // Added empty forum to last category
    var forum = new Forum(Charlatan.Helpers.forum(category));
    forum.save(callback);
  });
};

module.exports = function (N, callback) {
  Category  = N.models.forum.Section;
  Forum     = N.models.forum.Section;
  Topic    = N.models.forum.Topic;
  Post      = N.models.forum.Post;
  User      = N.models.users.User;
  UserGroup = N.models.users.UserGroup;

  UserGroup.find().select('_id short_name').exec(function(err, groups) {
    // collect usergroups
    groups.forEach(function(group) {
      usergroups_cache[group.short_name] = group;
    });

    async.series([
      function (next) {
        async.forEachSeries(_.range(USER_COUNT), function (current_user, next_user) {
          var user = new User(Charlatan.Helpers.user());
          user.usergroups = usergroups_cache['members'];
          user.save(next_user);

          // add user to store
          Charlatan.users.push(user);
        }, next);
      }
    , create_categories
    ], callback);
  });
};
