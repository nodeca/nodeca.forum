// Rebuild all forum posts
//
'use strict';


var async       = require('async');
var ObjectId    = require('mongoose').Types.ObjectId;


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

        //
        // Select first and last posts from Posts collection,
        // and split range between them into chunks
        //

        // find first post id
        N.models.forum.Post
            .find()
            .select('_id')
            .sort({ _id: 1 })
            .limit(1)
            .lean(true)
            .exec(function (err, first_post) {

          if (err) {
            callback(err);
            return;
          }

          // find last post id
          N.models.forum.Post
              .find()
              .select('_id')
              .sort({ _id: -1 })
              .limit(1)
              .lean(true)
              .exec(function (err, last_post) {

            if (err) {
              callback(err);
              return;
            }

            if (!first_post.length || !last_post.length) {
              callback(null, []);
              return;
            }

            var posts_per_chunk = 500;
            var msec_monthly    = 30 * 24 * 60 * 60 * 1000;

            // find an amount of posts created last month
            N.models.forum.Post
                .where('_id').gte(new ObjectId((last_post[0]._id.getTimestamp() - msec_monthly) / 1000))
                .count(function (err, monthly_post_count) {

              if (err) {
                callback(err);
                return;
              }

              // we want to process around 1000 posts per chunk,
              // so calculate the post rate based on last month
              var delta  = posts_per_chunk / monthly_post_count * msec_monthly;

              var chunks = [];
              var from   = first_post[0]._id.getTimestamp().valueOf() - 1;
              var to     = last_post[0]._id.getTimestamp().valueOf() + 1;
              var fromid = null;
              var toid   = new ObjectId(from / 1000);

              for (var ts = from; ts <= to; ts += delta) {
                fromid = toid;
                toid = new ObjectId((ts + delta) / 1000);

                chunks.push({
                  from:  fromid.toString(),
                  to:    toid.toString(),
                  runid: runid
                });
              }

              callback(null, chunks);
            });
          });
        });
      },

      process: function (callback) {
        var self = this;

        N.models.forum.Post
            .where('_id').gte(self.data.from)
            .where('_id').lte(self.data.to)
            .select('_id')
            .lean(true)
            .exec(function (err, posts) {

          N.logger.info('Rebuilding posts range ' +
            self.data.from + '-' + self.data.to + ' (found ' + posts.length + ')');

          if (err) {
            callback(err);
            return;
          }

          async.eachLimit(posts, 50, function (post, callback) {
            N.wire.emit('internal:forum.post_rebuild', post._id, callback);
          }, function (err) {
            if (err) {
              callback(err);
              return;
            }

            //
            // Send stat update to client
            //

            self.task.worker.status(self.task.id, function (err, data) {
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
          });
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
