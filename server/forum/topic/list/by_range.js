// Get a posts range defined by a post hid in the middle and an amount
// of posts before and after it
//
'use strict';

// Max posts to fetch before and after
const LIMIT = 50;

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid: { type: 'integer', required: true },
    post_hid:  { type: 'integer', required: true, minimum: 1 },
    before:    { type: 'integer', required: true, minimum: 0, maximum: LIMIT },
    after:     { type: 'integer', required: true, minimum: 0, maximum: LIMIT }
  });

  let buildPostHids = require('./_build_post_hids_by_range.js')(N);

  // Fetch posts subcall
  //
  N.wire.on(apiPath, function fetch_posts_list(env) {
    env.data.topic_hid = env.params.topic_hid;
    env.data.build_posts_ids = buildPostHids;

    return N.wire.emit('internal:forum.post_list', env);
  });


  // Add data from post cache:
  //  - last post number, used for navigation and progress bar display
  //  - inactive period, used for reply confirmation
  //
  // It's updated on the client on prefetch in case someone creates a new post
  //
  N.wire.on(apiPath, function attach_last_post_hid(env) {
    let cache = env.user_info.hb ? env.data.topic.cache_hb : env.data.topic.cache;

    env.res.max_post = cache.last_post_hid;
    env.res.topic_inactive_for = Math.abs(Date.now() - cache.last_ts);
  });
};
