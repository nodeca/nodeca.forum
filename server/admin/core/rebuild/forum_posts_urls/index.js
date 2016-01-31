// Add a widget displaying urls extraction progress
//

'use strict';


module.exports = function (N) {
  N.wire.after('server:admin.core.rebuild', { priority: 30 }, function* posts_urls_widget(env) {
    let data = yield N.queue.worker('forum_posts_urls').status();

    let task_info = {};

    if (data && data.state === 'aggregating') {
      task_info.current = data.chunks.done + data.chunks.errored;
      task_info.total   = data.chunks.done + data.chunks.errored +
                          data.chunks.active + data.chunks.pending;
    }

    env.res.blocks.push({ name: 'forum_posts_urls', task_info });
  });
};
