// Fetch topics for tracker
//
'use strict';


var ObjectId         = require('mongoose').Types.ObjectId;
var _                = require('lodash');
var async            = require('async');
var sanitize_topic   = require('nodeca.forum/lib/sanitizers/topic');
var sanitize_section = require('nodeca.forum/lib/sanitizers/section');


module.exports = function (N) {

  N.wire.on('internal:users.tracker.fetch', function tracker_fetch_topics(env, callback) {
    var topics = [];
    var sections = [];
    var read_marks;

    async.series([

      // Fetch topics by topic subscriptions
      //
      function (next) {
        var subs = _.filter(env.data.subscriptions, 'to_type', N.models.users.Subscription.to_types.FORUM_TOPIC);

        if (subs.length === 0) {
          next();
          return;
        }

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

        if (subs.length === 0) {
          next();
          return;
        }

        N.models.users.Marker.cuts(env.user_info.user_id, _.pluck(subs, 'to'), function (err, cuts) {
          if (err) {
            next(err);
            return;
          }

          var queryParts = [];

          _.forEach(cuts, function (cutTs, id) {
            queryParts.push({ $and: [ { section: id }, { _id: { $gt: new ObjectId(Math.round(cutTs / 1000)) } } ] });
          });

          N.models.forum.Topic.find({ $or: queryParts }).lean(true).exec(function (err, result) {
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

        N.models.users.Marker.info(env.user_info.user_id, data, function (err, result) {
          if (err) {
            next(err);
            return;
          }

          read_marks = result;

          // Filter new and unread topics
          topics = topics.reduce(function (acc, topic) {
            if (read_marks[topic._id].isNew || read_marks[topic._id].next !== -1) {
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


      // Fetch sections
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

          sections = result;
          next();
        });
      },


      // Sanitize topics
      //
      function (next) {
        sanitize_topic(N, topics, env.user_info, function (err, res) {
          if (err) {
            next(err);
            return;
          }

          topics = res;
          next();
        });
      },


      // Sanitize sections
      //
      function (next) {
        sanitize_section(N, sections, env.user_info, function (err, res) {
          if (err) {
            next(err);
            return;
          }

          sections = res;
          next();
        });
      }
    ], function (err) {
      if (err) {
        callback(err);
        return;
      }

      env.res.forum_topics = _.indexBy(topics, '_id');
      env.res.forum_sections = _.indexBy(sections, '_id');
      env.res.read_marks = _.assign(env.res.read_marks || {}, read_marks);

      topics.forEach(function (topic) {
        env.data.items.push({
          type: 'forum_topic',
          last_ts: topic.cache.last_ts,
          id: topic._id
        });
      });

      callback();
    });
  });
};
