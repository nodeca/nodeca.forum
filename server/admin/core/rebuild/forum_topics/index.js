// Add a widget displaying topic cache rebuild progress
//

'use strict';


module.exports = function (N) {
  N.wire.after('server:admin.core.rebuild', { priority: 40 }, function* rebuild_forum_topics_widget(env) {
    let task = yield N.queue.getTask('forum_topics_rebuild');
    let task_info = {};

    if (task && task.state !== 'finished') {
      task_info = {
        current: task.progress,
        total:   task.total
      };
    }

    env.res.blocks.push({ name: 'forum_topics', task_info });
  });
};
