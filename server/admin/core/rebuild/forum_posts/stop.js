// Stop post rebuild
//

'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});

  N.wire.on(apiPath, function forum_posts_rebuild_stop(env, callback) {
    N.queue.cancel('forum_posts_rebuild', N.queue.worker('forum_posts_rebuild').taskID(), callback);
  });
};
