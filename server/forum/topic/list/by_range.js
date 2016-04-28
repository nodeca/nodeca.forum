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
};
