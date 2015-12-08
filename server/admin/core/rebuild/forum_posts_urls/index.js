// Add a widget displaying urls extraction progress
//

'use strict';


module.exports = function (N) {
  N.wire.after('server:admin.core.rebuild', { priority: 30 }, function posts_urls_widget(env, callback) {
    N.queue.status('forum_posts_urls', N.queue.worker('forum_posts_urls').taskID(), function (err, data) {
      if (err) {
        callback(err);
        return;
      }

      var task_info = {};

      if (data && data.state === 'aggregating') {
        task_info.current = data.chunks.done.length + data.chunks.errored.length;
        task_info.total   = data.chunks.done.length + data.chunks.errored.length +
                            data.chunks.active.length + data.chunks.pending.length;
      }

      env.res.blocks.push({
        name:      'forum_posts_urls',
        task_info: task_info
      });

      callback();
    });
  });
};
