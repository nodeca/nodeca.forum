// Start topic cache rebuild
//

'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});

  N.wire.on(apiPath, function* forum_topics_rebuild_start() {
    yield N.queue.worker('forum_topics_rebuild').push();
  });
};
