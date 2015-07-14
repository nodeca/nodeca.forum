// Flush view counters from `forum.topic:views` in redis
// to `Topic.views_count` in mongo.
//
'use strict';


var _        = require('lodash');
var util     = require('util');
var ObjectId = require('mongoose').Types.ObjectId;


module.exports = function (N) {

  function flush_views(callback) {
    // Rename key first to avoid race conditions, ignoring errors for this op
    //
    N.redis.rename('views:forum_topic:count', 'views:forum_topic:count_tmp', function (/*err*/) {
      N.redis.hgetall('views:forum_topic:count_tmp', function (err, items) {
        if (err) {
          callback(err);
          return;
        }

        N.redis.del('views:forum_topic:count_tmp', function (err) {
          if (err) {
            callback(err);
            return;
          }

          if (_.isEmpty(items)) {
            callback();
            return;
          }

          var bulk = N.models.forum.Topic.collection.initializeUnorderedBulkOp();

          Object.keys(items).forEach(function (id) {
            bulk.find({ _id: new ObjectId(id) })
                .updateOne({ $inc: { views_count: Number(items[id]) } });
          });

          bulk.execute(callback);
        });
      });
    });
  }

  function cleanup_visited(callback) {
    N.redis.time(function (err, time) {
      if (err) {
        callback(err);
        return;
      }

      var score = Math.floor(time[0] * 1000 + time[1] / 1000);

      // decrease counter by 10 min
      score -= 10 * 60 * 1000;

      N.redis.zremrangebyscore('views:forum_topic:track_last', '-inf', score, callback);
    });
  }


  N.wire.on('init:jobs', function register_topic_views_update() {
    var task_name = 'topic_views_update';

    if (!N.config.cron || !N.config.cron[task_name]) {
      return new Error(util.format('No config defined for cron task "%s"', task_name));
    }

    N.queue.registerWorker({
      name: task_name,
      cron: N.config.cron[task_name],
      process: function (__, callback) {
        flush_views(function (err) {
          if (err) {
            // don't return an error in the callback because we don't need automatic reloading
            N.logger.error('"%s" job error: %s', task_name, err.message || err);
            callback();
            return;
          }

          cleanup_visited(function (err) {
            if (err) {
              N.logger.error('"%s" job error: %s', task_name, err.message || err);
              callback();
              return;
            }

            callback();
          });
        });
      }
    });
  });
};
