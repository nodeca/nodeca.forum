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
//
// Needed in:
//
// - `forum/section/section.js`
//
'use strict';


const _  = require('lodash');
const co = require('co');


module.exports = function (N) {

  // Shortcut
  const Topic = N.models.forum.Topic;

  return co.wrap(function* buildTopicsIds(env) {

    let topics_per_page = yield env.extras.settings.fetch('topics_per_page');

    // Page numbers starts from 1, not from 0
    let page_current = parseInt(env.params.page, 10);

    let topic_sort = env.user_info.hb ? { 'cache_hb.last_post': -1 } : { 'cache.last_post': -1 };

    // Algorithm:
    //
    // - get all visible topics IDs except pinned
    // - if at first page - add pinned topic ids
    // - insert pinned topic IDs at start

    let topics = yield Topic.find()
                            .where('section').equals(env.data.section._id)
                            .where('st').in(_.without(env.data.topics_visible_statuses, Topic.statuses.PINNED))
                            .select('_id')
                            .sort(topic_sort)
                            .skip((page_current - 1) * topics_per_page)
                            .limit(topics_per_page)
                            .lean(true);

    // Exit here if pinned topics not needed
    if (page_current <= 1 && env.data.topics_visible_statuses.indexOf(Topic.statuses.PINNED) !== -1) {
      // Fetch pinned topics ids for first page
      let pinned = yield Topic.find()
                              .where('section').equals(env.data.section._id)
                              .where('st').equals(Topic.statuses.PINNED)
                              .select('_id')
                              .sort(topic_sort)
                              .lean(true);

      // Put pinned topics IDs to start of `env.data.topics_ids`
      topics = pinned.concat(topics);
    }

    env.data.topics_ids = _.map(topics, '_id');
  });
};
