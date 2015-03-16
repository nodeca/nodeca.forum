// Get posts by page
//
'use strict';

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid: {
      type: 'integer',
      minimum: 1,
      required: true
    },
    page: {
      type: 'integer',
      minimum: 1,
      default: 1
    }
  });

  var buildPostIds = require('./_build_posts_ids_by_page.js')(N);

  // Fetch posts subcall
  //
  N.wire.on(apiPath, function fetch_posts_list(env, callback) {
    env.data.topic_hid = env.params.topic_hid;
    env.data.build_posts_ids = buildPostIds;

    N.wire.emit('internal:forum.post_list', env, callback);
  });


  // Fill pagination
  //
  N.wire.after(apiPath, function fill_pagination(env) {

    // Prepared by `buildPostIds`
    env.res.page = env.data.page;
  });
};
