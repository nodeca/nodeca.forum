// Fetch topics for subscriptions
//
'use strict';


var _                = require('lodash');
var async            = require('async');
var sanitize_topic   = require('nodeca.forum/lib/sanitizers/topic');
var sanitize_section = require('nodeca.forum/lib/sanitizers/section');


module.exports = function (N) {

  N.wire.on('internal:users.subscriptions.fetch', function subscriptions_fetch_topics(env, callback) {
    var sections = [];
    var topics = [];

    async.series([

      // Fetch topics
      //
      function (next) {
        var subs = _.filter(env.data.subscriptions, { to_type: N.models.users.Subscription.to_types.FORUM_TOPIC });

        N.models.forum.Topic.find().where('_id').in(_.map(subs, 'to')).lean(true).exec(function (err, result) {
          if (err) {
            next(err);
            return;
          }

          topics = result;
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

          sections = sections.reduce(function (acc, section, i) {
            if (access_env.data.access_read[i]) {
              acc.push(section);
            }

            return acc;
          }, []);

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

      // Fetch sections
      //
      function (next) {
        N.models.forum.Section.find()
            .where('_id').in(_.map(topics, 'section'))
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

      env.res.forum_topics = _.keyBy(topics, '_id');
      env.res.forum_sections = _.assign(env.res.forum_sections || {}, _.keyBy(sections, '_id'));

      callback();
    });
  });
};
