// Reflection helper for `internal:forum.topic_list`:
//
// 1. Builds IDs of topics to fetch for current page
// 2. Creates pagination info
//
// In:
//
// - env.user_info.hb
// - env.data.section
// - env.params.last_post_id
// - env.params.before
// - env.params.after
// - env.data.topics_visible_statuses - list of statuses, allowed to view
//
// Out:
//
// - env.data.topics_ids
//
// Needed in:
//
// - `forum/section/list/by_range.js`
//
'use strict';


const _  = require('lodash');
const co = require('co');


module.exports = function (N) {

  // Shortcut
  const Topic = N.models.forum.Topic;

  return co.wrap(function* buildTopicsIds(env) {
    let lookup_key = env.user_info.hb ? 'cache_hb.last_post' : 'cache.last_post';

    function select_visible_before() {
      let count = env.params.before;
      if (count <= 0) { return Promise.resolve([]); }

      let sort = {};
      sort[lookup_key] = 1;

      return Topic.find()
                  .where('section').equals(env.data.section._id)
                  .where(lookup_key).gt(env.params.last_post_id)
                  .where('st').in(_.without(env.data.topics_visible_statuses, Topic.statuses.PINNED))
                  .select('_id')
                  .sort(sort)
                  .limit(count)
                  .lean(true)
                  .then(topics => _.map(topics, '_id').reverse());
    }

    function select_visible_after() {
      let count = env.params.after;
      if (count <= 0) { return Promise.resolve([]); }

      let sort = {};
      sort[lookup_key] = -1;

      return Topic.find()
                  .where('section').equals(env.data.section._id)
                  .where(lookup_key).lt(env.params.last_post_id)
                  .where('st').in(_.without(env.data.topics_visible_statuses, Topic.statuses.PINNED))
                  .select('_id')
                  .sort(sort)
                  .limit(count)
                  .lean(true)
                  .then(topics => _.map(topics, '_id'));
    }


    // Run both functions in parallel and concatenate results
    //
    let results = yield [ select_visible_before(), select_visible_after() ];

    env.data.topics_ids = Array.prototype.concat.apply([], results);

    // Add pinned topics if we're reached start of the section
    //
    // Start is determined by the amount of topics we get from the database:
    // if there are less topics in the result than requested, we're there.
    //
    if (results[0].length < env.params.before &&
        env.data.topics_visible_statuses.indexOf(Topic.statuses.PINNED) !== -1) {

      let sort = {};
      sort[lookup_key] = -1;

      let topics = yield Topic.find()
                              .where('section').equals(env.data.section._id)
                              .where('st').equals(Topic.statuses.PINNED)
                              .select('_id')
                              .sort(sort)
                              .lean(true);

      // Put pinned topics IDs to start of `env.data.topics_ids`
      env.data.topics_ids = _.map(topics, '_id').concat(env.data.topics_ids);
    }
  });
};
