// Start post rebuild
//

'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});

  N.wire.on(apiPath, function* forum_posts_rebuild_start() {
    yield N.queue.forum_posts_rebuild().run();
  });
};
