// Start post rebuild
//

'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});

  N.wire.on(apiPath, function* forum_posts_rebuild_start() {
    yield N.queue.worker('forum_posts_rebuild').push();
  });
};
