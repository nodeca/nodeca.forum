// Used in:
// - `forum/section/section.js`
// - `forum/section/list/by_page.js`
//
'use strict';

var _ = require('lodash');

module.exports = function (N) {

  // Shortcut
  var Topic = N.models.forum.Topic;

  return function buildTopicsIds(env, callback) {
    env.extras.settings.fetch('topics_per_page', function (err, topics_per_page) {
      if (err) {
        callback(err);
        return;
      }


      var max = Math.ceil(env.data.section.cache.topic_count / topics_per_page) || 1;
      var current = parseInt(env.params.page, 10);
      var start = (current - 1) * topics_per_page;
      var topicSort = {};

      env.data.page = { max: max, current: current };

      if (env.user_info.hb || env.data.settings.can_see_hellbanned) {
        topicSort['cache_hb.last_ts'] = -1;
      } else {
        topicSort['cache.last_ts'] = -1;
      }

      Topic.find()
          .where('section').equals(env.data.section._id)
          .where('st').in(_.without(env.data.topics_visible_statuses, Topic.statuses.PINNED))
          .select('_id')
          .sort(topicSort)
          .skip(start)
          .limit(topics_per_page)
          .lean(true)
          .exec(function (err, topics) {

        if (err) {
          callback(err);
          return;
        }

        env.data.topics_ids = _.pluck(topics, '_id');

        if (current > 1) {
          callback();
          return;
        }

        // Fetch pinned topics ids for first page
        Topic.find()
            .where('section').equals(env.data.section._id)
            .where('st').equals(Topic.statuses.PINNED)
            .select('_id')
            .sort(topicSort)
            .lean(true)
            .exec(function (err, topics) {

          if (err) {
            callback(err);
            return;
          }

          env.data.topics_ids = _.pluck(topics, '_id').concat(env.data.topics_ids);
          callback();
        });
      });
    });
  };
};
