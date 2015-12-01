// Collect all urls from all posts and store them to mongodb
//
'use strict';


var ObjectId    = require('mongoose').Types.ObjectId;
var cheequery   = require('nodeca.core/lib/parser/cheequery');


module.exports = function (N) {
  N.wire.on('init:jobs', function register_forum_posts_urls() {
    N.queue.registerWorker({
      name: 'forum_posts_urls',

      // static id to make sure it will never be executed twice at the same time
      taskID: function () {
        return 'forum_posts_urls';
      },

      chunksPerInstance: 1,

      map: function (callback) {
        var runid = Date.now();

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

            var chunks = [];
            var from   = first_post[0]._id.getTimestamp().valueOf() - 1;
            var to     = last_post[0]._id.getTimestamp().valueOf() + 1;
            var delta  = 7 * 24 * 60 * 60 * 1000;
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
      },

      process: function (callback) {
        // TODO: when task is stopped manually, queue seem to start sending
        //       nulls as payload, need to investigate it further
        if (!this.data) {
          callback();
          return;
        }

        var self = this;

        // Send stat update to client and finish task
        //
        function done() {
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

            N.live.debounce('admin.core.rebuild.forum_posts_urls', task_info);

            callback(null, self.data.runid);
          });
        }

        N.models.forum.Post
            .where('_id').gte(self.data.from)
            .where('_id').lte(self.data.to)
            .select('html')
            .lean(true)
            .exec(function (err, posts) {

          N.logger.info('Extracting urls from posts range ' +
            self.data.from + '-' + self.data.to + ' (found ' + posts.length + ')');

          if (err) {
            callback(err);
            return;
          }

          if (!posts.length) {
            callback();
            return;
          }

          var urls = [];

          posts.forEach(function (post) {
            var $html = cheequery(post.html);

            // already converted snippets
            $html.find('.ez-block').addBack('.ez-block').each(function () {
              var url = cheequery(this).data('nd-orig');

              if (url) {
                urls.push({ url: url, auto: true });
              }
            });

            // external urls
            $html.find('.link-ext').addBack('.link-ext').each(function () {
              var url = cheequery(this).attr('href');

              if (url) {
                urls.push({ url: url, auto: cheequery(this).hasClass('link-auto') });
              }
            });
          });

          if (!urls.length) {
            done();
            return;
          }

          var bulk = N.models.forum.PostUrl.collection.initializeUnorderedBulkOp();

          urls.forEach(function (u) {
            bulk.find({ url: u.url }).upsert().update({
              $set: {
                url:     u.url,
                is_auto: u.auto,
                rand:    Math.random(),
                status:  N.models.forum.PostUrl.statuses.PENDING
              }
            });
          });

          bulk.execute(function (err) {
            if (err) {
              callback(err);
              return;
            }

            done();
          });
        });
      },

      reduce: function (chunksResult, callback) {
        var task_info = {
          current: 1,
          total:   1,
          runid:   chunksResult[0] || 0
        };

        N.live.emit('admin.core.rebuild.forum_posts_urls', task_info);

        callback();
      }
    });
  });
};
