// Flush view counters from `forum.topic:views` in redis
// to `Topic.views_count` in mongo.
//
'use strict';


const _        = require('lodash');
const Promise  = require('bluebird');
const ObjectId = require('mongoose').Types.ObjectId;


module.exports = function (N) {
  N.wire.on('init:jobs', function register_topic_views_update() {
    const task_name = 'topic_views_update';

    if (!N.config.cron || !N.config.cron[task_name]) {
      return new Error(`No config defined for cron task "${task_name}"`);
    }

    N.queue.registerTask({
      name: task_name,
      cron: N.config.cron[task_name],
      process: Promise.coroutine(function* () {
        try {
          //
          // Flush views
          //

          // rename key first to avoid race conditions
          try {
            yield N.redis.renameAsync('views:forum_topic:count', 'views:forum_topic:count_tmp');
          } catch (__) {}

          let items = yield N.redis.hgetallAsync('views:forum_topic:count_tmp');

          yield N.redis.delAsync('views:forum_topic:count_tmp');

          if (!_.isEmpty(items)) {
            let bulk = N.models.forum.Topic.collection.initializeUnorderedBulkOp();

            Object.keys(items).forEach(function (id) {
              bulk.find({ _id: new ObjectId(id) })
                  .updateOne({ $inc: { views_count: Number(items[id]) } });
            });

            yield bulk.execute();
          }

          //
          // Cleanup visited
          //
          let time = yield N.redis.timeAsync();
          let score = Math.floor(time[0] * 1000 + time[1] / 1000);

          // decrease counter by 10 min
          score -= 10 * 60 * 1000;

          yield N.redis.zremrangebyscoreAsync('views:forum_topic:track_last', '-inf', score);
        } catch (err) {
          // don't propagate errors because we don't need automatic reloading
          N.logger.error('"%s" job error: %s', task_name, err.message || err);
        }
      })
    });
  });
};
