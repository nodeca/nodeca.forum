// Fetch images from remote servers and store their size to post.image_info
//
'use strict';


var async    = require('async');
var _        = require('lodash');
var get_size = require('probe-image-size');

// a number of times the task can be re-created if image fetch errors out
var MAX_RETRIES = 2;


module.exports = function (N) {

  N.wire.on('init:jobs', function register_forum_post_images_fetch() {
    N.queue.registerWorker({
      name: 'forum_post_images_fetch',

      // 5 minute delay by default
      postponeDelay: 5 * 60 * 1000,

      timeout: 120000,

      taskID: function (taskData) {
        return taskData.post_id;
      },

      process: function (callback) {
        var self          = this;
        var update        = {};
        var needs_rebuild = false;
        var needs_restart = false;
        var post_id       = self.data.post_id;
        var retry_count   = self.data.retry || 0;
        var interval;

        // Put pending data from "update" object into a database.
        //
        function flush_data(callback) {
          if (_.isEmpty(update)) {
            callback();
            return;
          }

          N.models.forum.Post.findById(post_id).exec(function (err, post) {
            if (err) {
              callback(err);
              return;
            }

            if (!post) {
              callback();
              return;
            }

            var updateData = { $set: {} };

            Object.keys(update).forEach(function (key) {
              if (_.isObject(post.image_info) && post.image_info[key] === null) {
                updateData.$set['image_info.' + key] = update[key];
              }
            });

            update = {};

            N.models.forum.Post.update({ _id: post._id }, updateData, callback);
          });
        }

        // write image info into database once every 10 sec
        // (in addition to writing after all images are retrieved)
        interval = setInterval(function () {
          flush_data(function () {});
        }, 10000);

        N.models.forum.Post.findById(post_id).exec(function (err, post) {
          if (err) {
            callback(err);
            return;
          }

          if (!post || !_.isObject(post.image_info)) {
            callback(null, []);
            return;
          }

          var extendDeadline = _.throttle(function () {
            self.setDeadline();
          }, 10000);

          async.mapLimit(Object.keys(post.image_info), 4, function (key, _next) {
            extendDeadline();

            var next = _.once(_next);

            if (!key.match(/^url:/)) {
              // if it's not an external image (e.g. attachment), skip
              next();
              return;
            }

            if (post.image_info[key]) {
              // if it's already loaded, skip
              next();
              return;
            }

            // key is "prefix"+"url with replaced dots", example:
            // url:http://example．com/foo．jpg
            var url = key.slice(4).replace(/．/g, '.');

            get_size(url, function (err, result) {
              if (err) {
                // if we can't parse file or status code is 4xx, this request is final
                var url_failed = (err.code === 'ECONTENT') ||
                                 (err.status && err.status >= 400 && err.status < 500);

                if (url_failed || retry_count >= MAX_RETRIES) {
                  update[key] = { error: err.status || err.message };
                } else {
                  needs_restart = true;
                }

                next();
                return;
              }

              update[key] = _.omitBy({
                width:  result.width,
                height: result.height,
                length: result.length
              }, _.isUndefined);

              needs_rebuild = true;

              next();
            });
          }, function (err) {
            if (err) {
              callback(err);
              return;
            }

            clearInterval(interval);

            flush_data(function (err) {
              if (err) {
                callback(err);
                return;
              }

              if (needs_restart) {
                N.queue.worker('forum_post_images_fetch').postpone({
                  post_id: post_id,
                  retry:   retry_count + 1
                }, function () {});
              }

              if (!needs_rebuild) {
                callback();
                return;
              }

              N.wire.emit('internal:forum.post_rebuild', post_id, callback);
            });
          });
        });
      }
    });
  });
};
