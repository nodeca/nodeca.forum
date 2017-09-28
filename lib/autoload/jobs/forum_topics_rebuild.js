// Rebuild cache for forum topics
//
'use strict';


const _        = require('lodash');
const Queue    = require('idoit');


const CHUNKS_TO_ADD    = 100;
const CHUNKS_MIN_COUNT = 50;
const TOPICS_PER_CHUNK = 100;


module.exports = function (N) {
  N.wire.on('init:jobs', function register_forum_topics_rebuild() {
    // Iterator
    //
    N.queue.registerTask({
      name: 'forum_topics_rebuild',
      pool: 'hard',
      baseClass: Queue.IteratorTemplate,
      taskID: () => 'forum_topics_rebuild',

      async iterate(state) {
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

        let topics = await query;


        // Check finished
        //
        if (!topics.length) return null;


        // Add chunks
        //
        let chunks = _.chunk(topics.map(t => String(t._id)), TOPICS_PER_CHUNK)
                      .map(ids => N.queue.forum_topics_rebuild_chunk(ids));

        return {
          tasks: chunks,
          state: String(topics[topics.length - 1]._id)
        };
      },

      async init() {
        let query = N.models.forum.Topic.count();

        if (this.args.length < 1 || !this.args[0]) {
          // if no min _id
          let min_topic = await N.models.forum.Topic.findOne()
                                    .select('_id')
                                    .sort({ _id: 1 })
                                    .lean(true);

          this.args[0] = String(min_topic._id);
        } else {
          // min _id already specified
          // (if it's not, we count all topics without extra conditions,
          // which results in faster query)
          query = query.where('_id').gte(this.args[0]);
        }

        if (this.args.length < 2 || !this.args[1]) {
          // if no max _id
          let max_topic = await N.models.forum.Topic.findOne()
                                    .select('_id')
                                    .sort({ _id: -1 })
                                    .lean(true);

          this.args[1] = String(max_topic._id);
        } else {
          // max _id already specified
          query = query.where('_id').lte(this.args[1]);
        }

        let topics_count = await query;

        this.total = Math.ceil(topics_count / TOPICS_PER_CHUNK);
      }
    });


    // Chunk
    //
    N.queue.registerTask({
      name: 'forum_topics_rebuild_chunk',
      pool: 'hard',
      removeDelay: 3600,
      async process(ids) {
        N.logger.info(`Rebuilding topic caches ${ids[0]}-${ids[ids.length - 1]} - ${ids.length} found`);

        await Promise.all(ids.map(id => N.models.forum.Topic.updateCache(id)));
      }
    });


    N.queue.on('task:progress:forum_topics_rebuild', function (task_info) {
      N.live.debounce('admin.core.rebuild.forum_topics', {
        uid:     task_info.uid,
        current: task_info.progress,
        total:   task_info.total
      });
    });


    N.queue.on('task:end:forum_topics_rebuild', function (task_info) {
      N.live.emit('admin.core.rebuild.forum_topics', {
        uid:      task_info.uid,
        finished: true
      });
    });
  });
};
