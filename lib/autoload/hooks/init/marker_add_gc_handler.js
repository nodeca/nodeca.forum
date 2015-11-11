// Add gc handler to `N.models.users.Marker`
//
'use strict';


var async          = require('async');
var ObjectId       = require('mongoose').Types.ObjectId;
var userInfo       = require('nodeca.users/lib/user_info');
var sanitize_topic = require('nodeca.forum/lib/sanitizers/topic');


module.exports = function (N) {

  function forum_topic_gc_handler(userId, categoryId, currentCut, callback) {
    var user_info;
    var topics;

    async.series([

      // Fetch user_info
      //
      function (next) {
        userInfo(N, userId, function (err, info) {
          if (err) {
            next(err);
            return;
          }

          user_info = info;
          next();
        });
      },

      // Fetch topics
      //
      function (next) {
        var query = N.models.forum.Topic.find().where('section').equals(categoryId);

        if (user_info.hb) {
          query.where('cache_hb.last_post');
        } else {
          query.where('cache.last_post');
        }

        query.gt(new ObjectId(Math.round(currentCut / 1000)));

        query.lean(true).exec(function (err, res) {
          if (err) {
            next(err);
            return;
          }

          topics = res;
          next();
        });
      },

      // Check access
      //
      function (next) {
        var access_env = { params: { topics: topics, user_info: user_info } };

        N.wire.emit('internal:forum.access.topic', access_env, function (err) {
          if (err) {
            next(err);
            return;
          }

          topics = topics.filter((__, i) => access_env.data.access_read[i]);
          next();
        });
      },

      // Sanitize
      //
      function (next) {
        sanitize_topic(N, topics, user_info, function (err, res) {
          if (err) {
            next(err);
            return;
          }

          topics = res;
          next();
        });
      }

    ], function (err) {
      if (err) {
        callback(err);
        return;
      }

      var result = topics.map(function (topic) {
        return {
          categoryId: topic.section,
          contentId: topic._id,
          lastPostNumber: topic.last_post_hid,
          lastPostTs: topic.cache.last_ts
        };
      });

      callback(null, result);
    });
  }


  N.wire.after('init:models', { priority: 50 }, function marker_add_gc_handler() {
    N.models.users.Marker.registerGc('forum_topic', forum_topic_gc_handler);
  });
};
