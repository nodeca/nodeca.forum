// Rebuild all forum posts
//
'use strict';


const Promise  = require('bluebird');
const _        = require('lodash');
const Queue    = require('ido');


const CHUNKS_TO_ADD    = 100;
const CHUNKS_MIN_COUNT = 50;
const POSTS_PER_CHUNK  = 100;


module.exports = function (N) {
  N.wire.on('init:jobs', function register_forum_posts_rebuild() {
    let poolName = (N.config.fork || {}).qhard ? 'hard' : 'default';


    // Iterator
    //
    N.queue.registerTask({
      name: 'forum_posts_rebuild',
      poolName,
      baseClass: Queue.IteratorTemplate,
      taskID: () => 'forum_posts_rebuild',

      iterate: Promise.coroutine(function* (state) {
        let active_chunks = this.children_created - this.children_finished;


        // Idle if we still have more than `CHUNKS_MIN_COUNT` chunks
        //
        if (active_chunks >= CHUNKS_MIN_COUNT) return {};


        // Fetch posts _id
        //
        let query = N.models.forum.Post.find()
                        .where('_id').gte(this.args[0]) // min
                        .select('_id')
                        .sort({ _id: -1 })
                        .limit(POSTS_PER_CHUNK * CHUNKS_TO_ADD)
                        .lean(true);

        // If state is present it is always smaller than max _id
        if (state) {
          query.where('_id').lt(state);
        } else {
          query.where('_id').lte(this.args[1]); // max
        }

        let posts = yield query;


        // Check finished
        //
        if (!posts.length) {

          // Send stat update to client
          // TODO: don't send progress here, send notification about finish instead
          N.live.debounce('admin.core.rebuild.forum_posts', {
            current: this.progress,
            total:   this.total
          });

          return null;
        }


        // Add chunks
        //
        let chunks = _.chunk(posts.map(p => String(p._id)), POSTS_PER_CHUNK)
                      .map(ids => N.queue.forum_posts_rebuild_chunk(ids));

        return {
          tasks: chunks,
          state: String(posts[posts.length - 1]._id)
        };
      }),

      init: Promise.coroutine(function* () {
        // if no min _id
        if (this.args.length < 1 || !this.args[0]) {
          let min_post = yield N.models.forum.Post.findOne()
                                  .select('_id')
                                  .sort({ _id: 1 })
                                  .lean(true);

          this.args[0] = String(min_post._id);
        }

        // if no max _id
        if (this.args.length < 2 || !this.args[1]) {
          let max_post = yield N.models.forum.Post.findOne()
                                  .select('_id')
                                  .sort({ _id: -1 })
                                  .lean(true);

          this.args[1] = String(max_post._id);
        }

        let post_count = yield N.models.forum.Post.count()
                                  .where('_id').gte(this.args[0])
                                  .where('_id').lte(this.args[1]);

        this.total = Math.ceil(post_count / POSTS_PER_CHUNK);
      })
    });


    // Chunk
    //
    N.queue.registerTask({
      name: 'forum_posts_rebuild_chunk',
      poolName,
      process: Promise.coroutine(function* (ids) {
        let start_time = Date.now();

        N.logger.info(`Rebuilding forum posts ${ids[0]}-${ids[ids.length - 1]} - ${ids.length} found`);

        yield Promise.map(
          ids,
          id => N.wire.emit('internal:forum.post_rebuild', id),
          // TODO: is this needed?
          { concurrency: 50 }
        );

        N.logger.info(`Rebuilding forum posts ${ids[0]}-${ids[ids.length - 1]} - finished (${
          ((Date.now() - start_time) / 1000).toFixed(1)
          }s)`);


        // Send stat update to client
        //
        let task = yield N.queue.getTask('forum_posts_rebuild');

        if (task) {
          let task_info = {
            current: task.progress,
            total:   task.total
          };

          N.live.debounce('admin.core.rebuild.forum_posts', task_info);
        }
      })
    });
  });
};
