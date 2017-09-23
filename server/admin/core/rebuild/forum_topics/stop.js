// Stop topic cache rebuild
//

'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});

  N.wire.on(apiPath, async function forum_topics_rebuild_stop() {
    await N.queue.cancel('forum_topics_rebuild');
  });
};
