'use strict';


/*
 * This seed create data for demo section:
 *   3 category, each category contain 10 sections
 *   last section in 3rd category is empty
 *   first section contain 200 topics, all others only one
 *   first topic in first topic contain 100 post, all others only one
 *
 */

var _         = require('lodash');
var async     = require('async');
var Charlatan = require('charlatan');

// topic and post statuses
var statuses = require('../../server/forum/_lib/statuses.js');

var Category;
var Section;
var Topic;
var Post;
var User;
var UserGroup;
var settings;


var CATEGORY_COUNT = 3;
var SECTION_COUNT  = 10;
var SUB_SECTION_DEEP = 1;
var TOPIC_COUNT_IN_BIG_SECTION  = 200;
var POST_COUNT_IN_BIG_TOPIC  = 100;
var USER_COUNT = 200;
var MAX_MODERATOR_COUNT = 3;
var MAX_SUB_SECTION_COUNT = 3;

var display_order = 0;

var getNextDisplayOrder = function () {
  display_order++;
  return display_order;
};

var users = [];

var postDay = 0;

var createPost = function (topic, callback) {

  var post = new Post({
    text: Charlatan.Lorem.paragraphs(Charlatan.Helpers.rand(5, 1)).join(' '),
    fmt: 'txt',

    st: statuses.post.VISIBLE,
    topic: topic._id,

    user: users[Charlatan.Helpers.rand(USER_COUNT)],

    ts: new Date(2010, 0, postDay++)
  });

  post.save(function (err, post) {
    if (err) {
      callback(err);
      return;
    }

    User.update({ _id: post.user }, { $inc: { post_count: 1 }}, function (err) {
      callback(err, post);
    });
  });
};

var createTopic = function (section, post_count, callback) {

  var first_post;
  var last_post;

  var topic = new Topic({
    title: Charlatan.Lorem.sentence().slice(0, -1),

    st: statuses.topic.OPEN,
    section: section._id,

    views_count: Charlatan.Helpers.rand(1000)
  });

  topic.save(function (err) {
    if (err) {
      callback(err);
      return;
    }

    async.timesSeries(post_count, function (idx, next) {
        createPost(topic, function (err, post) {
          if (err) {
            next(err);
            return;
          }

          if (!first_post) {
            first_post = post;
          }

          last_post = post;
          next();
        });
      }, function (err) {
        // update topic
        if (err) {
          callback(err);
        }

        topic.cache.post_count = post_count;

        topic.cache.first_post = first_post._id;
        topic.cache.first_ts = first_post.ts;
        topic.cache.first_user = first_post.user;

        topic.cache.last_post = last_post._id;
        topic.cache.last_ts = last_post.ts;
        topic.cache.last_user = last_post.user;

        _.extend(topic.cache_hb, topic.cache);

        topic.save(callback);
      }
    );
  });
};

var createSection = function (category, sub_section_deep, callback) {

  var section = new Section({
    title: Charlatan.Lorem.sentence(Charlatan.Helpers.rand(5, 3)).slice(0, -1),
    description: Charlatan.Lorem.sentence(),

    parent: category._id,
    display_order: getNextDisplayOrder(),

    cache: {
      real: {}
    }
  });

  section.save(function (err) {
    if (err) {
      callback(err);
      return;
    }

    // add sub-sections
    if (!sub_section_deep || Charlatan.Helpers.rand(3) === 2) {
      callback();
      return;
    }

    async.timesSeries(Charlatan.Helpers.rand(MAX_SUB_SECTION_COUNT), function (idx, next) {
      createSection(section, sub_section_deep - 1, next);
    }, callback);
  });
};


var createUsers = function (callback) {

  var userGroupsByName = {};

  async.series([ function getUsersByName(cb) {
      UserGroup.find().select('_id short_name').exec(function (err, groups) {
        if (err) {
          cb(err);
          return;
        }

        // collect usergroups
        groups.forEach(function (group) {
          userGroupsByName[group.short_name] = group;
        });
        cb();
      });

    }, function (cb) {

      async.timesSeries(USER_COUNT, function (current_user, next_user) {
        var nick = Charlatan.Internet.userName();
        var first_name = Charlatan.Name.firstName();
        var last_name = Charlatan.Name.lastName();
        var user = new User({
          first_name: first_name,
          last_name: last_name,
          nick: nick,
          name: first_name + ' (' + nick + ') ' + last_name,

          email: Charlatan.Internet.email(),

          joined_ts: new Date(),

          usergroups: userGroupsByName.members
        });
        user.save(next_user);

        // add user to store
        users.push(user);
      }, cb);
    }
  ], function (err) {
    callback(err);
  });
};

var createSections = function (callback) {

  async.timesSeries(CATEGORY_COUNT, function (current_category, next_category) {
    var category = new Category({
      title: Charlatan.Lorem.sentence(Charlatan.Helpers.rand(5, 3)).slice(0, -1),
      description: Charlatan.Lorem.sentence(),

      display_order: getNextDisplayOrder('display_order'),
      is_category: true
    });

    category.save(function (err) {
      if (err) {
        next_category(err);
        return;
      }

      // create sections
      async.timesSeries(SECTION_COUNT, function (idx, next) {
        createSection(category, SUB_SECTION_DEEP, next);
      }, next_category);
    });
  }, callback);
};

function updateSectionStat(section, callback) {

  var lastTopic;
  var topicCount;
  var postCount;

  async.series([ function getLastTopic(cb) {
      Topic.findOne({section: section._id}).select('_id hid title cache')
        .sort({ 'hid': 1 })
        .exec(function (err, topic) {

          if (err) {
            cb(err);
            return;
          }

          lastTopic = topic;

          cb();
        });
    }, function getTopicCount(cb) {
      Topic.count({section: section._id})
        .exec(function (err, count) {

          if (err) {
            cb(err);
            return;
          }

          topicCount = count;
          cb();
        });

    }, function getPostCount(cb) {

      Topic.aggregate(
        { $match: { section: section._id }},
        { $group: { _id: null, count: { $sum: '$cache.post_count' }}},
        { $project: { _id: 0, count: 1 }}, function (err, sum) {

          if (err) {
            cb(err);
            return;
          }

          postCount = (_.isArray(sum) && sum[0] && sum[0].count) ? sum[0].count : 0; // get first element of result
          cb();
        });
    }
  ], function (err) {

    if (err) {
      callback(err);
      return;
    }

    // No topic, just exit
    if (!lastTopic) {
      callback(err);
      return;
    }

    section.cache.last_topic = lastTopic._id;
    section.cache.last_topic_hid = lastTopic.hid;
    section.cache.last_topic_title = lastTopic.title;

    var topicReal = lastTopic.cache;
    section.cache.last_post = topicReal.last_post;
    section.cache.last_ts = topicReal.last_ts;
    section.cache.last_user = topicReal.last_user;

    section.cache.post_count = postCount;
    section.cache.topic_count = topicCount;
    _.extend(section.cache_hb, section.cache);

    section.save(callback);
  });
}

var createTopics = function (callback) {

  Section.find({ is_category: false }).select('_id cache')
    .sort({ 'hid': -1 })
    .skip(1)
    .exec(function (err, sections) {

      if (err) {
        callback();
        return;
      }

      async.forEachSeries(sections, function (section, cb) {
        //create topic with single post
        createTopic(section, 1, function (err) {
          if (err) {
            callback(err);
            return;
          }

          updateSectionStat(section, cb);
        });
      }, callback);
    });
};

var fillBigSection = function (callback) {

  Section.findOne({ is_category: false }).select('_id cache')
    .sort({ 'hid': 1 })
    .exec(function (err, section) {

      if (err) {
        callback();
        return;
      }

      async.series([ function (cb) {
        async.timesSeries(TOPIC_COUNT_IN_BIG_SECTION, function (idx, next) {
            createTopic(section, 1, next);
          }, cb);

      }, function (cb) {
          updateSectionStat(section, cb);
        }
      ], callback);
    });
};

var addBigTopic = function (callback) {

  Section.findOne({ is_category: false }).select('_id cache')
    .sort({ 'hid': 1 })
    .exec(function (err, section) {

      if (err) {
        callback();
        return;
      }

      createTopic(section, POST_COUNT_IN_BIG_TOPIC, function (err) {
        if (err) {
          callback();
          return;
        }

        updateSectionStat(section, callback);
      });
    });
};

var addModerators = function (callback) {

  var SectionModeratorStore = settings.getStore('section_moderator');

  if (!SectionModeratorStore) {
    callback('Settings store `section_moderator` is not registered.');
    return;
  }

  Section.find({ is_category: false }).select('_id')
    .exec(function (err, sections) {

      async.forEach(sections, function (section, cb) {

        async.timesSeries(Charlatan.Helpers.rand(MAX_MODERATOR_COUNT), function (index, next) {
          var user = users[Charlatan.Helpers.rand(USER_COUNT)];

          SectionModeratorStore.set(
            { forum_mod_visible: { value: true } },
            { section_id: section._id, user_id: user._id },
            next
          );
        }, cb);
      }, callback);
    });
};

module.exports = function (N, callback) {
  Category  = N.models.forum.Section;
  Section   = N.models.forum.Section;
  Topic     = N.models.forum.Topic;
  Post      = N.models.forum.Post;
  User      = N.models.users.User;
  UserGroup = N.models.users.UserGroup;
  settings  = N.settings;

  async.series([
    createUsers,
    createSections,
    createTopics,
    fillBigSection,
    addBigTopic,
    addModerators

  ], callback);
};
