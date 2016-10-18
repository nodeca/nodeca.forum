// Add a widget displaying post rebuild progress
//
'use strict';


module.exports = function (N) {
  N.wire.after('server:admin.core.rebuild', { priority: 20 }, function* rebuild_forum_posts_widget(env) {
    let task = yield N.queue.getTask('forum_posts_rebuild');
    let task_info = {};

    if (task && task.state !== 'finished') {
      task_info = {
        current: task.progress,
        total:   task.total
      };
    }

    env.res.blocks.push({ name: 'forum_posts', task_info });
  });
};
