// Rebuild cache for forum topics
//
'use strict';


const Promise  = require('bluebird');

const TOPICS_PER_CHUNK = 1000;


module.exports = function (N) {
  N.wire.on('init:jobs', function register_forum_topics_rebuild() {
    N.queue.registerWorker({
      name: 'forum_topics_rebuild',

      // static id to make sure it will never be executed twice at the same time
      taskID() {
        return 'forum_topics_rebuild';
      },

      chunksPerInstance: 1,

      * map() {
        let runid = Date.now();

        let last_topic = yield N.models.forum.Topic
                                             .findOne()
                                             .sort('-hid')
                                             .lean(true);

        let chunks = [];

        for (let i = 0; i <= last_topic.hid; i += TOPICS_PER_CHUNK) {
          chunks.push({ from: i, to: i + TOPICS_PER_CHUNK - 1, runid });
        }

        return chunks;
      },

      * process() {
        let topics = yield N.models.forum.Topic
                                         .where('hid').gte(this.data.from)
                                         .where('hid').lte(this.data.to)
                                         .select('_id')
                                         .lean(true);

        N.logger.info('Rebuilding topic caches ' + this.data.from + '-' + this.data.to);

        yield Promise.map(topics, topic => N.models.forum.Topic.updateCache(topic._id));

        //
        // Send stat update to client
        //

        let data = yield this.task.worker.status(this.task.id);

        if (data) {
          let task_info = {
            current: data.chunks.done + data.chunks.errored,
            total:   data.chunks.done + data.chunks.errored +
                     data.chunks.active + data.chunks.pending,
            runid:   this.data.runid
          };

          N.live.debounce('admin.core.rebuild.forum_topics', task_info);
        }

        return this.data.runid;
      },

      reduce(chunksResult) {
        var task_info = {
          current: 1,
          total:   1,
          runid:   chunksResult[0] || 0
        };

        N.live.emit('admin.core.rebuild.forum_topics', task_info);
      }
    });
  });
};
