// Rebuild all forum posts
//
'use strict';


module.exports = function (N) {
  N.wire.on('init:jobs', function register_forum_posts_rebuild() {
    N.queue.registerWorker({
      name: 'forum_posts_rebuild',

      // static id to make sure it will never be executed twice at the same time
      taskID: function () {
        return 'forum_posts_rebuild';
      },

      chunksPerInstance: 1,

      map: function (callback) {
        var runid = Date.now();

        callback(null, [ { runid: runid } ]);
      },

      process: function (callback) {
        var self = this;

        //
        // Send stat update to client
        //

        N.queue.status(self.task.id, function (err, data) {
          if (err) {
            callback(err);
            return;
          }

          if (!data) {
            // This should not happen, but required for safety
            callback(err);
            return;
          }

          var task_info = {
            current: data.chunks.done.length + data.chunks.errored.length,
            total:   data.chunks.done.length + data.chunks.errored.length +
                     data.chunks.active.length + data.chunks.pending.length,
            runid:   self.data.runid
          };

          N.live.debounce('admin.core.rebuild.forum_posts', task_info);

          callback(null, self.data.runid);
        });
      },

      reduce: function (chunksResult, callback) {
        var task_info = {
          current: 1,
          total:   1,
          runid:   chunksResult[0] || 0
        };

        N.live.emit('admin.core.rebuild.forum_posts', task_info);

        callback();
      }
    });
  });
};
