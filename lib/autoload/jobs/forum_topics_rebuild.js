// Rebuild cache for forum topics
//
'use strict';


const Promise  = require('bluebird');
const _        = require('lodash');
const Queue    = require('ido');


const CHUNKS_TO_ADD    = 100;
const CHUNKS_MIN_COUNT = 50;
const TOPICS_PER_CHUNK = 100;


module.exports = function (N) {
  N.wire.on('init:jobs', function register_forum_topics_rebuild() {
    let poolName = (N.config.fork || {}).qhard ? 'hard' : 'default';


    // Iterator
    //
    N.queue.registerTask({
      name: 'forum_topics_rebuild',
      poolName,
      baseClass: Queue.IteratorTemplate,
      taskID: () => 'forum_topics_rebuild',

      iterate: Promise.coroutine(function* (state) {
        let active_chunks = this.children_created - this.children_finished;


        // Idle if we still have more than `CHUNKS_MIN_COUNT` chunks
        //
        if (active_chunks >= CHUNKS_MIN_COUNT) return {};


        // Fetch posts _id
        //
        let query = N.models.forum.Topic.find()
                        .where('_id').gte(this.args[0]) // min
                        .select('_id')
                        .sort({ _id: -1 })
                        .limit(TOPICS_PER_CHUNK * CHUNKS_TO_ADD)
                        .lean(true);

        // If state is present it is always smaller than max _id
        if (state) {
          query.where('_id').lt(state);
        } else {
          query.where('_id').lte(this.args[1]); // max
        }

        let topics = yield query;


        // Check finished
        //
        if (!topics.length) {

          // Send stat update to client
          // TODO: don't send progress here, send notification about finish instead
          N.live.debounce('admin.core.rebuild.forum_topics', {
            current: this.progress,
            total:   this.total
          });

          return null;
        }


        // Add chunks
        //
        let chunks = _.chunk(topics.map(t => String(t._id)), TOPICS_PER_CHUNK)
                      .map(ids => N.queue.forum_topics_rebuild_chunk(ids));

        return {
          tasks: chunks,
          state: String(topics[topics.length - 1]._id)
        };
      }),

      init: Promise.coroutine(function* () {
        // if no min _id
        if (this.args.length < 1 || !this.args[0]) {
          let min_topic = yield N.models.forum.Topic.findOne()
                                    .select('_id')
                                    .sort({ _id: 1 })
                                    .lean(true);

          this.args[0] = String(min_topic._id);
        }

        // if no max _id
        if (this.args.length < 2 || !this.args[1]) {
          let max_topic = yield N.models.forum.Topic.findOne()
                                    .select('_id')
                                    .sort({ _id: -1 })
                                    .lean(true);

          this.args[1] = String(max_topic._id);
        }

        let topics_count = yield N.models.forum.Topic.count()
                                    .where('_id').gte(this.args[0])
                                    .where('_id').lte(this.args[1]);

        this.total = Math.ceil(topics_count / TOPICS_PER_CHUNK);
      })
    });


    // Chunk
    //
    N.queue.registerTask({
      name: 'forum_topics_rebuild_chunk',
      poolName,
      process: Promise.coroutine(function* (ids) {
        N.logger.info(`Rebuilding topic caches ${ids[0]}-${ids[ids.length - 1]} - ${ids.length} found`);

        yield Promise.map(ids, id => N.models.forum.Topic.updateCache(id));


        // Send stat update to client
        //
        let task = yield N.queue.getTask('forum_topics_rebuild');

        if (task) {
          let task_info = {
            current: task.progress,
            total:   task.total
          };

          N.live.debounce('admin.core.rebuild.forum_topics', task_info);
        }
      })
    });
  });
};
