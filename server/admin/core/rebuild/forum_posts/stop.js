// Stop post rebuild
//

'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});

  N.wire.on(apiPath, function forum_posts_rebuild_stop(env, callback) {
    N.queue.cancel('queue:forum_posts_rebuild:forum_posts_rebuild', callback);
  });
};
