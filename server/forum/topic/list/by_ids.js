// Get posts by ids
//
'use strict';

// Max posts ids to fetch
var LIMIT = 100;

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid: {
      type: 'integer',
      minimum: 1,
      required: true
    },
    post_ids: {
      type: 'array',
      required: true,
      uniqueItems: true,
      maxItems: LIMIT,
      items: { format: 'mongo' }
    }
  });


  function buildPostIds(env, callback) {
    env.data.post_ids = env.params.post_ids;
    callback();
  }


  // Fetch posts subcall
  //
  N.wire.on(apiPath, function fetch_posts_list(env, callback) {
    env.data.topic_hid = env.params.topic_hid;
    env.data.build_posts_ids = buildPostIds;

    N.wire.emit('internal:forum.post_list', env, callback);
  });
};
