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
var charlatan = require('charlatan');


var Category;
var Section;
var Topic;
var Post;
var User;
var Vote;
var UserGroup;
var settings;
var parser;


var CATEGORY_COUNT = 3;
var SECTION_COUNT  = 10;
var SUB_SECTION_DEEP = 1;
var TOPIC_COUNT_IN_BIG_SECTION  = 200;
var POST_COUNT_IN_BIG_TOPIC  = 100;
var USER_COUNT = 200;
var MAX_MODERATOR_COUNT = 3;
var MAX_SUB_SECTION_COUNT = 3;
var MAX_VOTES = 10;

var display_order = 0;

function getNextDisplayOrder() {
  display_order++;
  return display_order;
}

var users = [];

var postDay = 0;

function createPost(topic, reply_to, callback) {

  var md = charlatan.Lorem.paragraphs(charlatan.Helpers.rand(5, 1)).join('\n\n');
  var user = users[charlatan.Helpers.rand(USER_COUNT)];

  settings.getByCategory(
    'forum_markup',
    { usergroup_ids: user.usergroups },
    { alias: true },
    function (err, settings) {
      if (err) {
        callback(err);
        return;
      }

      parser(
        {
          text: md,
          attachments: [],
          options: settings
        },
        function (err, result) {
          if (err) {
            callback(err);
            return;
          }

          var post = new Post({
            html:    result.html,
            md:      md,

            st:      Post.statuses.VISIBLE,
            topic:   topic._id,

            user:    user,

            /*eslint-disable new-cap*/
            ip:      charlatan.Internet.IPv4(),

            to:      reply_to ? reply_to._id  : void(0),
            to_user: reply_to ? reply_to.user : void(0),

            ts:      new Date(2010, 0, postDay++),

            params:  settings
          });

          post.save(function (err, post) {
            if (err) {
              callback(err);
              return;
            }

            User.update({ _id: post.user }, { $inc: { post_count: 1 } }, function (err) {
              callback(err, post);
            });
          });
        }
      );
    }
  );
}

function addVotes(post, callback) {
  var votes = 0;

  async.timesSeries(charlatan.Helpers.rand(MAX_VOTES), function (__, next) {
    var user = users[charlatan.Helpers.rand(USER_COUNT)];
    var value = Math.random() > 0.5 ? 1 : -1;

    var vote = new Vote({
      to:     post.user,
      from:   user._id,
      'for':  post._id,
      type:   Vote.types.FORUM_POST,
      value:  value
    });

    votes += value;

    vote.save(next);

  }, function (err) {
    if (err) {
      callback(err);
      return;
    }

    post.update({ votes: votes }, callback);
  });
}

function createTopic(section, post_count, callback) {

  var first_post;
  var last_post;

  var topic = new Topic({
    title: charlatan.Lorem.sentence().slice(0, -1),

    st: Topic.statuses.OPEN,
    section: section._id,

    views_count: charlatan.Helpers.rand(1000)
  });

  topic.save(function (err) {
    if (err) {
      callback(err);
      return;
    }

    var posts = [];

    async.timesSeries(post_count, function (idx, next) {
        // 50% posts won't have any reply information, 25% posts will be
        // answers to the previous post, 12.5% posts will be answers to the
        // 2nd last post and so on.
        //
        var reply_id = posts.length - Math.floor(1 / Math.random()) + 1,
            reply_to = posts[reply_id];

        createPost(topic, reply_to, function (err, post) {
          if (err) {
            next(err);
            return;
          }

          if (!first_post) {
            first_post = post;
          }

          last_post = post;

          posts.push(post);

          addVotes(post, next);
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

        _.assign(topic.cache_hb, topic.cache);

        topic.save(callback);
      }
    );
  });
}

function createSection(category, sub_section_deep, callback) {

  var section = new Section({
    title: charlatan.Lorem.sentence(charlatan.Helpers.rand(5, 3)).slice(0, -1),
    description: charlatan.Lorem.sentence(),

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
    if (!sub_section_deep || charlatan.Helpers.rand(3) === 2) {
      callback();
      return;
    }

    async.timesSeries(charlatan.Helpers.rand(MAX_SUB_SECTION_COUNT), function (idx, next) {
      createSection(section, sub_section_deep - 1, next);
    }, callback);
  });
}


function createUsers(callback) {

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
        var user = new User({
          first_name: charlatan.Name.firstName(),
          last_name:  charlatan.Name.lastName(),
          nick:       charlatan.Internet.userName(),
          email:      charlatan.Internet.email(),
          joined_ts:  new Date(),
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
}

function createSections(callback) {

  async.timesSeries(CATEGORY_COUNT, function (current_category, next_category) {
    var category = new Category({
      title: charlatan.Lorem.sentence(charlatan.Helpers.rand(5, 3)).slice(0, -1),
      description: charlatan.Lorem.sentence(),

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
}

function updateSectionStat(section, callback) {

  var lastTopic;
  var topicCount;
  var postCount;

  async.series([ function getLastTopic(cb) {
      Topic.findOne({ section: section._id }).select('_id hid title cache')
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
      Topic.count({ section: section._id })
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
        { $match: { section: section._id } },
        { $group: { _id: null, count: { $sum: '$cache.post_count' } } },
        { $project: { _id: 0, count: 1 } }, function (err, sum) {

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
    _.assign(section.cache_hb, section.cache);

    section.save(callback);
  });
}

function createTopics(callback) {

  Section.find({ is_category: false }).select('_id cache')
    .sort({ 'hid': -1 })
    .skip(1)
    .exec(function (err, sections) {

      if (err) {
        callback();
        return;
      }

      async.eachSeries(sections, function (section, cb) {
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
}

function fillBigSection(callback) {

  Section.findOne({ is_category: false }).select('_id cache')
    .sort({ 'hid': 1 })
    .exec(function (err, section) {

      if (err) {
        callback();
        return;
      }

      async.series([
        function (cb) {
          async.timesSeries(TOPIC_COUNT_IN_BIG_SECTION, function (idx, next) {
            createTopic(section, 1, next);
          }, cb);
        },
        function (cb) {
          updateSectionStat(section, cb);
        }
      ], callback);
    });
}

function addBigTopic(callback) {

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
}

function addModerators(callback) {

  var SectionModeratorStore = settings.getStore('section_moderator');

  if (!SectionModeratorStore) {
    callback('Settings store `section_moderator` is not registered.');
    return;
  }

  Section.find({ is_category: false }).select('_id')
    .exec(function (err, sections) {
      if (err) {
        callback(err);
        return;
      }

      async.each(sections, function (section, cb) {

        async.timesSeries(charlatan.Helpers.rand(MAX_MODERATOR_COUNT), function (index, next) {
          var user = users[charlatan.Helpers.rand(USER_COUNT)];

          SectionModeratorStore.set(
            { forum_mod_visible: { value: true } },
            { section_id: section._id, user_id: user._id },
            next
          );
        }, cb);
      }, callback);
    });
}

module.exports = function (N, callback) {
  Category  = N.models.forum.Section;
  Section   = N.models.forum.Section;
  Topic     = N.models.forum.Topic;
  Post      = N.models.forum.Post;
  User      = N.models.users.User;
  UserGroup = N.models.users.UserGroup;
  Vote      = N.models.users.Vote;
  settings  = N.settings;
  parser    = N.parse;

  async.series([
    createUsers,
    createSections,
    createTopics,
    fillBigSection,
    addBigTopic,
    addModerators

  ], callback);
};
