// Reindex all forum topics (iterator started from admin interface)
//
'use strict';


const _        = require('lodash');
const Queue    = require('idoit');


const CHUNKS_TO_ADD    = 100;
const CHUNKS_MIN_COUNT = 1;
const TOPICS_PER_CHUNK = 100;


module.exports = function (N) {

  N.wire.on('init:jobs', function register_forum_topics_search_rebuild() {

    N.queue.registerTask({
      name: 'forum_topics_search_rebuild',
      pool: 'hard',
      baseClass: Queue.IteratorTemplate,
      taskID: () => 'forum_topics_search_rebuild',

      async iterate(state) {
        let active_chunks = this.children_created - this.children_finished;


        // Idle if we still have more than `CHUNKS_MIN_COUNT` chunks
        //
        if (active_chunks >= CHUNKS_MIN_COUNT) return {};


        // Fetch topic _id
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
                      .map(ids => N.queue.forum_topics_search_update_by_ids(ids, { shadow: true }));

        return {
          tasks: chunks,
          state: String(topics[topics.length - 1]._id)
        };
      },

      async init() {
        // set min _id and max _id
        // (arguments are ignored for forum topic reindex only because
        // it happens fast enough for us to not want cutoff)
        let min_topic = await N.models.forum.Topic.findOne()
                                  .select('_id')
                                  .sort({ _id: 1 })
                                  .lean(true);

        this.args[0] = String(min_topic._id);

        let max_topic = await N.models.forum.Topic.findOne()
                                  .select('_id')
                                  .sort({ _id: -1 })
                                  .lean(true);

        this.args[1] = String(max_topic._id);

        let topics_count = await N.models.forum.Topic.count();

        this.total = Math.ceil(topics_count / TOPICS_PER_CHUNK);
      }
    });
  });
};
