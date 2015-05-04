// Reflection helper for `internal:forum.topic_list`:
//
// 1. Builds IDs of topics to fetch for current page
// 2. Creates pagination info
//
// In:
//
// - env.user_info.hb
// - env.data.section
// - env.params.page
// - env.data.topics_visible_statuses - list of statuses, allowed to view
//
// Out:
//
// - env.data.topics_ids
// - env.data.pagination
//
// Needed in:
//
// - `forum/section/section.js`
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

      // Fetch visible topic count to calculate pagination. Don't use cache here - need
      // live pagination updates for users with different permissions.
      Topic.where('section').equals(env.data.section._id)
          .where('st').in(_.without(env.data.topics_visible_statuses, Topic.statuses.PINNED))
          .count(function (err, topic_count) {

        if (err) {
          callback(err);
          return;
        }

        // Page numbers starts from 1, not from 0
        var page_current = parseInt(env.params.page, 10);

        env.data.pagination = {
          total:        topic_count,
          per_page:     topics_per_page,
          chunk_offset: topics_per_page * (page_current - 1)
        };

        var topic_sort = env.user_info.hb ? { 'cache_hb.last_post': -1 } : { 'cache.last_post': -1 };

        // Algorithm:
        //
        // - get all visible topics IDs except pinned
        // - if at first page - add pinned topic ids
        // - insert pinned topic IDs at start

        Topic.find()
            .where('section').equals(env.data.section._id)
            .where('st').in(_.without(env.data.topics_visible_statuses, Topic.statuses.PINNED))
            .select('_id')
            .sort(topic_sort)
            .skip((page_current - 1) * topics_per_page)
            .limit(topics_per_page)
            .lean(true)
            .exec(function (err, topics) {

          if (err) {
            callback(err);
            return;
          }

          env.data.topics_ids = _.pluck(topics, '_id');

          // Exit here if pinned topics not needed
          if (page_current > 1 || env.data.topics_visible_statuses.indexOf(Topic.statuses.PINNED) === -1) {
            callback();
            return;
          }

          // Fetch pinned topics ids for first page
          Topic.find()
              .where('section').equals(env.data.section._id)
              .where('st').equals(Topic.statuses.PINNED)
              .select('_id')
              .sort(topic_sort)
              .lean(true)
              .exec(function (err, topics) {

            if (err) {
              callback(err);
              return;
            }

            // Put pinned topics IDs to start of `env.data.topics_ids`
            env.data.topics_ids = _.pluck(topics, '_id').concat(env.data.topics_ids);
            callback();
          });
        });
      });
    });
  };
};
