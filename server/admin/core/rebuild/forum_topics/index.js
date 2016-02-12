// Add a widget displaying topic cache rebuild progress
//

'use strict';


module.exports = function (N) {
  N.wire.after('server:admin.core.rebuild', { priority: 20 }, function* rebuild_forum_topics_widget(env) {
    let data = yield N.queue.worker('forum_topics_rebuild').status();

    let task_info = {};

    if (data && data.state === 'aggregating') {
      task_info.current = data.chunks.done + data.chunks.errored;
      task_info.total   = data.chunks.done + data.chunks.errored +
                          data.chunks.active + data.chunks.pending;
    }

    env.res.blocks.push({ name: 'forum_topics', task_info });
  });
};
