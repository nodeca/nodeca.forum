// Reflection helper for `internal:forum.section`:
//
// 1. Builds IDs of topics to fetch for current page
// 2. Creates pagination info
//
// In:
//
// - env.user_info.hb
// - env.data.section
// - env.data.select_topics_before (Number)   - amount of topics before current
// - env.data.select_topics_start (ObjectId)  - last post id (not topic id) to count from
// - env.data.topics_visible_statuses (Array) - list of statuses allowed to view
//
// Out:
//
// - env.data.topics_ids
//
// Needed in:
//
// - `forum/section/section.js`
// - `forum/section/list/by_range.js`
//

'use strict';


const _       = require('lodash');


module.exports = function (N) {

  // Shortcut
  const Topic = N.models.forum.Topic;

  return async function buildTopicsIds(env) {
    env.data.topics_ids = [];

    let lookup_key = env.user_info.hb ? 'cache_hb.last_post' : 'cache.last_post';

    let count = env.data.select_topics_before;

    if (count > 0 && env.data.select_topics_start) {
      let query = Topic.find();

      if (env.data.select_topics_start) {
        query = query.where(lookup_key).gt(env.data.select_topics_start);
      }

      let results = await query
                            .where('section').equals(env.data.section._id)
                            .where('st').in(_.without(env.data.topics_visible_statuses, Topic.statuses.PINNED))
                            .select('_id')
                            .sort(`${lookup_key}`)
                            .limit(count)
                            .lean(true);

      env.data.topics_ids = results.map(r => r._id).reverse();
    }

    // Add pinned topics if we're reached start of the section
    //
    // Start is determined by the amount of topics we get from the database:
    // if there are less topics in the result than requested, we're there.
    //
    if (env.data.topics_ids.length < env.data.select_topics_before &&
        env.data.topics_visible_statuses.indexOf(Topic.statuses.PINNED) !== -1) {

      let topics = await Topic.find()
                              .where('section').equals(env.data.section._id)
                              .where('st').equals(Topic.statuses.PINNED)
                              .select('_id')
                              .sort(`-${lookup_key}`)
                              .lean(true);

      // Put pinned topics IDs to start of `env.data.topics_ids`
      env.data.topics_ids = topics.map(t => t._id).concat(env.data.topics_ids);
    }
  };
};
