// Reflection helper for `internal:forum.section`:
//
// 1. Builds IDs of topics to fetch for current page
// 2. Creates pagination info
//
// In:
//
// - env.user_info.hb
// - env.data.section
// - env.data.select_topics_after (Number)    - amount of topics after current
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


module.exports = function (N) {

  // Shortcut
  const Topic = N.models.forum.Topic;


  return async function buildTopicIds(env) {
    env.data.topics_ids = [];

    let lookup_key = env.user_info.hb ? 'cache_hb.last_post' : 'cache.last_post';

    let count = env.data.select_topics_after;

    if (count > 0) {
      let query = Topic.find();

      if (env.data.select_topics_start) {
        query = query.where(lookup_key).lt(env.data.select_topics_start);
      }

      let results = await query
                            .where('section').equals(env.data.section._id)
                            .where('st').in(env.data.topics_visible_statuses.filter(x => x !== Topic.statuses.PINNED))
                            .select('_id')
                            .sort(`-${lookup_key}`)
                            .limit(count)
                            .lean(true);

      env.data.topics_ids = results.map(r => r._id);
    }
  };
};
