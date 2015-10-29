// Fetch topics for tracker
//
'use strict';


var ObjectId = require('mongoose').Types.ObjectId;
var _        = require('lodash');
var async    = require('async');
var fields   = require('./_fields/topic_list');


module.exports = function (N) {

  N.wire.on('internal:users.tracker.fetch', function tracker_fetch_topics(env, callback) {
    var topics = [];
    var sections;
    var marks;

    async.series([

      // Fetch topics by topic subscriptions
      //
      function (next) {
        var subs = _.filter(env.data.subscriptions, 'to_type', N.models.users.Subscription.to_types.FORUM_TOPIC);

        N.models.forum.Topic.find().where('_id').in(_.pluck(subs, 'to')).lean(true).exec(function (err, result) {
          if (err) {
            next(err);
            return;
          }

          topics = topics.concat(result || []);
          next();
        });
      },


      // Fetch topics by section subscriptions
      //
      function (next) {
        var subs = _.filter(env.data.subscriptions, 'to_type', N.models.users.Subscription.to_types.FORUM_SECTION);

        N.settings.get('content_read_marks_expire', function (err, content_read_marks_expire) {
          if (err) {
            callback(err);
            return;
          }

          var lastTs = Math.round((Date.now() - (content_read_marks_expire * 24 * 60 * 60 * 1000)) / 1000);

          N.models.forum.Topic.find()
              .where('section').in(_.pluck(subs, 'to'))
              // Exclude old one
              .where('_id').gt(new ObjectId(lastTs))
              .lean(true)
              .exec(function (err, result) {

            if (err) {
              next(err);
              return;
            }

            topics = _.uniq(topics.concat(result || []), function (topic) {
              return String(topic._id);
            });
            next();
          });
        });
      },


      // Fetch read marks
      //
      function (next) {
        var data = [];

        topics.forEach(function (topic) {
          data.push({
            categoryId: topic.section,
            contentId: topic._id,
            lastPosition: topic.last_post_hid,
            lastPositionTs: topic.cache.last_ts
          });
        });

        N.models.core.Marker.info(env.user_info.user_id, data, function (err, result) {
          if (err) {
            next(err);
            return;
          }

          marks = result;

          // Filter new and unread topics
          topics = topics.reduce(function (acc, topic) {
            if (marks[topic._id].isNew || marks[topic._id].next !== -1) {
              acc.push(topic);
            }

            return acc;
          }, []);

          next();
        });
      },


      // Check permissions subcall
      //
      function (next) {
        var access_env = { params: { topics: topics, user_info: env.user_info } };

        N.wire.emit('internal:forum.access.topic', access_env, function (err) {
          if (err) {
            next(err);
            return;
          }

          topics = topics.reduce(function (acc, topic, i) {
            if (access_env.data.access_read[i]) {
              acc.push(topic);
            }

            return acc;
          }, []);

          next();
        });
      },


      // Collect user ids
      //
      function (next) {
        env.data.users = env.data.users || [];
        env.data.users = env.data.users.concat(_.pluck(topics, 'cache.last_user'));
        env.data.users = env.data.users.concat(_.pluck(topics, 'cache.first_user'));
        next();
      },


      // Fetch sections hid
      //
      function (next) {
        N.models.forum.Section.find()
            .where('_id').in(_.pluck(topics, 'section'))
            .lean(true)
            .exec(function (err, result) {

          if (err) {
            next(err);
            return;
          }

          sections = (result || []).reduce(function (acc, section) {
            acc[section._id] = section;
            return acc;
          }, {});
          next();
        });
      },


      // Sanitize topics and sections
      //
      function (next) {
        var Topic = N.models.forum.Topic;

        env.extras.settings.fetch('can_see_hellbanned', function (err, can_see_hellbanned) {
          if (err) {
            next(err);
            return;
          }

          topics = topics.map(function (topic) {
            var restrictedTopic = _.pick(topic, fields.topic);

            if (restrictedTopic.st === Topic.statuses.HB && !can_see_hellbanned) {
              restrictedTopic.st = restrictedTopic.ste;
              delete restrictedTopic.ste;
            }

            if (restrictedTopic.cache_hb && (env.user_info.hb || can_see_hellbanned)) {
              restrictedTopic.cache = restrictedTopic.cache_hb;
            }

            delete restrictedTopic.cache_hb;

            return restrictedTopic;
          });

          sections = _.mapValues(sections, function (section) {
            var restrictedSection = _.pick(section, fields.section);

            if (restrictedSection.cache_hb && (env.user_info.hb || can_see_hellbanned)) {
              restrictedSection.cache = restrictedSection.cache_hb;
            }
            delete restrictedSection.cache_hb;

            return restrictedSection;
          });

          next();
        });
      }
    ], function (err) {
      if (err) {
        callback(err);
        return;
      }

      topics.forEach(function (topic) {
        env.data.items.push({
          data: {
            topic: topic,
            read_mark: marks[topic._id],
            section: sections[topic.section]
          },
          ts: topic.cache.last_ts,
          type: 'forum_topic'
        });
      });

      callback();
    });
  });
};
