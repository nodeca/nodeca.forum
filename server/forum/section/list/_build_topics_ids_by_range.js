// Reflection helper for `internal:forum.topic_list`:
//
// 1. Builds IDs of topics to fetch for current page
// 2. Creates pagination info
//
// In:
//
// - env.user_info.hb
// - env.data.section
// - env.data.select_posts_before
// - env.data.select_posts_after
// - env.data.select_posts_start
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


const _       = require('lodash');
const Promise = require('bluebird');


module.exports = function (N) {

  // Shortcut
  const Topic = N.models.forum.Topic;

  function select_visible_before(env) {
    let lookup_key = env.user_info.hb ? 'cache_hb.last_post' : 'cache.last_post';

    let count = env.data.select_posts_before;
    if (count <= 0) return Promise.resolve([]);

    // first page, don't need to fetch anything
    if (!env.data.select_posts_start) return Promise.resolve([]);

    let query = Topic.find();

    if (env.data.select_posts_start) {
      query = query.where(lookup_key).gt(env.data.select_posts_start);
    }

    return query
             .where('section').equals(env.data.section._id)
             .where('st').in(_.without(env.data.topics_visible_statuses, Topic.statuses.PINNED))
             .select('_id')
             .sort(`${lookup_key}`)
             .limit(count)
             .lean(true)
             .then(topics => _.map(topics, '_id').reverse());
  }

  function select_visible_after(env) {
    let lookup_key = env.user_info.hb ? 'cache_hb.last_post' : 'cache.last_post';

    let count = env.data.select_posts_after;
    if (count <= 0) return Promise.resolve([]);

    let query = Topic.find();

    if (env.data.select_posts_start) {
      if (env.data.select_posts_after > 0 && env.data.select_posts_before > 0) {
        // if we're selecting both `after` and `before`, include current post
        // in the result, otherwise don't
        query = query.where(lookup_key).lte(env.data.select_posts_start);
        count++;
      } else {
        query = query.where(lookup_key).lt(env.data.select_posts_start);
      }
    }

    return query
             .where('section').equals(env.data.section._id)
             .where('st').in(_.without(env.data.topics_visible_statuses, Topic.statuses.PINNED))
             .select('_id')
             .sort(`-${lookup_key}`)
             .limit(count)
             .lean(true)
             .then(topics => _.map(topics, '_id'));
  }


  return Promise.coroutine(function* buildTopicsIds(env) {
    let lookup_key = env.user_info.hb ? 'cache_hb.last_post' : 'cache.last_post';

    // Run both functions in parallel and concatenate results
    //
    let results = yield Promise.all([ select_visible_before(env), select_visible_after(env) ]);

    env.data.topics_ids = Array.prototype.concat.apply([], results);

    // Add pinned topics if we're reached start of the section
    //
    // Start is determined by the amount of topics we get from the database:
    // if there are less topics in the result than requested, we're there.
    //
    if (results[0].length < env.data.select_posts_before &&
        env.data.topics_visible_statuses.indexOf(Topic.statuses.PINNED) !== -1) {

      let topics = yield Topic.find()
                              .where('section').equals(env.data.section._id)
                              .where('st').equals(Topic.statuses.PINNED)
                              .select('_id')
                              .sort(`-${lookup_key}`)
                              .lean(true);

      // Put pinned topics IDs to start of `env.data.topics_ids`
      env.data.topics_ids = _.map(topics, '_id').concat(env.data.topics_ids);
    }
  });
};
