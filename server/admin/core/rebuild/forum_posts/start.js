// Start post rebuild
//

'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});

  N.wire.on(apiPath, async function forum_posts_rebuild_start() {
    await N.queue.forum_posts_rebuild().run();
  });
};
