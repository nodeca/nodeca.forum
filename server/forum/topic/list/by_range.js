// Get a posts range defined by a post hid in the middle and an amount
// of posts before and after it
//
'use strict';

// Max posts to fetch before and after
var LIMIT = 50;

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid: {
      type: 'integer',
      required: true
    },
    post_hid: {
      type: 'integer',
      minimum: 1,
      required: true
    },
    before: {
      type: 'integer',
      minimum: 0,
      maximum: LIMIT,
      required: true
    },
    after: {
      type: 'integer',
      minimum: 0,
      maximum: LIMIT,
      required: true
    }
  });

  var buildPostIds = require('./_build_posts_ids_by_range.js')(N);

  // Fetch posts subcall
  //
  N.wire.on(apiPath, function fetch_posts_list(env, callback) {
    env.data.topic_hid = env.params.topic_hid;
    env.data.build_posts_ids = buildPostIds;

    N.wire.emit('internal:forum.post_list', env, callback);
  });
};
