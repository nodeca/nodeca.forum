// Stop post rebuild
//

'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});

  N.wire.on(apiPath, async function forum_posts_rebuild_stop() {
    await N.queue.cancel('forum_posts_rebuild');
  });
};
