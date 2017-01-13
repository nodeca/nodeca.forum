// Reindex forum topics
//
'use strict';


const _        = require('lodash');
const Promise  = require('bluebird');
const Queue    = require('idoit');
const docid    = require('nodeca.forum/lib/search/docid_topics');


const CHUNKS_TO_ADD    = 100;
const CHUNKS_MIN_COUNT = 1;
const TOPICS_PER_CHUNK = 100;


module.exports = function (N) {

  N.wire.on('init:jobs', function register_forum_topics_reindex() {
    // Iterator
    //
    N.queue.registerTask({
      name: 'forum_topics_reindex',
      pool: 'hard',
      baseClass: Queue.IteratorTemplate,
      taskID: () => 'forum_topics_reindex',

      iterate: Promise.coroutine(function* (state) {
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

        let topics = yield query;


        // Check finished
        //
        if (!topics.length) return null;


        // Add chunks
        //
        let chunks = _.chunk(topics.map(t => String(t._id)), TOPICS_PER_CHUNK)
                      .map(ids => N.queue.forum_topics_reindex_chunk(ids));

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
      name: 'forum_topics_reindex_chunk',
      pool: 'hard',
      removeDelay: 3600,
      process: Promise.coroutine(function* (ids) {
        N.logger.info(`Reindexing topics ${ids[0]}-${ids[ids.length - 1]} - ${ids.length} found`);

        let topics = yield N.models.forum.Topic.find()
                               .where('_id').in(ids)
                               .lean(true);

        if (topics.length) {
          let values = [];
          let args = [];

          for (let topic of topics) {
            values.push('(?,?,?,?,?)');
            args.push(docid(N, topic.hid));
            args.push(topic.title);
            args.push(String(topic._id));
            args.push(String(topic.section));
            args.push(Math.floor(topic.cache.first_ts / 1000));
          }

          yield N.search.execute_shadow(
            'REPLACE INTO forum_topics (id, content, objectid, parentid, ts) VALUES ' + values.join(', '),
            args
          );
        }
      })
    });
  });
};
