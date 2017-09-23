// Start topic cache rebuild
//

'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});

  N.wire.on(apiPath, async function forum_topics_rebuild_start() {
    await N.queue.forum_topics_rebuild().run();
  });
};
