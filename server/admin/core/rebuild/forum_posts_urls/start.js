// Start link extraction from forum posts
//

'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});

  N.wire.on(apiPath, function forum_posts_urls_start(env, callback) {
    N.queue.worker('forum_posts_urls').push(callback);
  });
};
