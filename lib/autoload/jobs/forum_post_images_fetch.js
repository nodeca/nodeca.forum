// Fetch images from remote servers and store their size to post.image_info
//
'use strict';


const _        = require('lodash');
const Promise  = require('bluebird');
const co       = require('bluebird-co').co;
const get_size = require('probe-image-size');

// a number of times the task can be re-created if image fetch errors out
const MAX_RETRIES = 2;


module.exports = function (N) {

  N.wire.on('init:jobs', function register_forum_post_images_fetch() {
    N.queue.registerWorker({
      name: 'forum_post_images_fetch',

      // 5 minute delay by default
      postponeDelay: 5 * 60 * 1000,

      timeout: 120000,

      taskID(taskData) {
        return taskData.post_id;
      },

      * process() {
        let update        = {};
        let needs_rebuild = false;
        let needs_restart = false;
        let post_id       = this.data.post_id;
        let retry_count   = this.data.retry || 0;
        let flush_promise;
        let interval;

        // Put pending data from "update" object into a database.
        //
        function flush_data() {
          if (_.isEmpty(update)) return Promise.resolve();

          return N.models.forum.Post.findById(post_id).then(post => {
            if (!post) return;

            let updateData = { $set: {} };

            Object.keys(update).forEach(key => {
              if (_.isObject(post.image_info) && post.image_info[key] === null) {
                updateData.$set['image_info.' + key] = update[key];
              }
            });

            update = {};

            return N.models.forum.Post.update({ _id: post._id }, updateData);
          });
        }

        // write image info into database once every 10 sec
        // (in addition to writing after all images are retrieved)
        interval = setInterval(function () {
          flush_promise = flush_data();
        }, 10000);

        let post = yield N.models.forum.Post.findById(post_id);

        if (!post || !_.isObject(post.image_info)) return;

        const extendDeadline = _.throttle(() => {
          this.setDeadline();
        }, 10000);

        yield Promise.map(Object.keys(post.image_info), co.wrap(function* (key) {
          extendDeadline();

          // if it's not an external image (e.g. attachment), skip
          if (!key.match(/^url:/)) return;

          // if it's already loaded, skip
          if (post.image_info[key]) return;

          // key is "prefix"+"url with replaced dots", example:
          // url:http://example．com/foo．jpg
          let url = key.slice(4).replace(/．/g, '.');

          let result;

          try {
            result = yield Promise.fromCallback(cb => get_size(url, cb));
          } catch (err) {
            // if we can't parse file or status code is 4xx, this request is final
            let url_failed = (err.code === 'ECONTENT') ||
                             (err.status && err.status >= 400 && err.status < 500);

            if (url_failed || retry_count >= MAX_RETRIES) {
              update[key] = { error: err.status || err.message };
            } else {
              needs_restart = true;
            }

            return;
          }

          update[key] = _.omitBy({
            width:  result.width,
            height: result.height,
            length: result.length
          }, _.isUndefined);

          needs_rebuild = true;
        }, { concurrency: 4 }));

        clearInterval(interval);

        // wait for flush_data called on interval, and then call
        // flush_data again just to be sure
        if (flush_promise) yield flush_promise;
        yield flush_data();

        if (needs_restart) {
          N.queue.worker('forum_post_images_fetch').postpone({
            post_id,
            retry:   retry_count + 1
          });
        }

        if (needs_rebuild) {
          yield N.wire.emit('internal:forum.post_rebuild', post_id);
        }
      }
    });
  });
};
