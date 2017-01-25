// Reindex forum topics
//
'use strict';


const _              = require('lodash');
const Promise        = require('bluebird');
const Queue          = require('idoit');
const docid_topics   = require('nodeca.forum/lib/search/docid_topics');
const docid_sections = require('nodeca.forum/lib/search/docid_sections');
const userInfo       = require('nodeca.users/lib/user_info');


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

        if (!topics.length) return;

        let sections = yield N.models.forum.Section.find()
                                 .where('_id').in(_.uniq(topics.map(topic => String(topic.section))))
                                 .lean(true);

        let sections_by_id = _.keyBy(sections, '_id');

        let user_info = yield userInfo(N, null);
        let access_env = { params: { topics, user_info } };

        yield N.wire.emit('internal:forum.access.topic', access_env);

        let is_topic_public = {};

        topics.forEach((topic, idx) => {
          is_topic_public[topic._id] = access_env.data.access_read[idx] &&
                                       sections_by_id[topic.section].is_searchable;
        });

        let values = [];
        let args = [];

        for (let topic of topics) {
          let visible = N.models.forum.Topic.statuses.LIST_VISIBLE.indexOf(topic.st) !== -1;

          values.push('(?,?,?,?,?,?,?)');

          // id
          args.push(docid_topics(N, topic.hid));
          // content
          args.push(topic.title);
          // object_id
          args.push(String(topic._id));
          // section_uid
          args.push(docid_sections(N, sections_by_id[topic.section].hid));
          // public
          args.push((is_topic_public[topic._id] && visible) ? 1 : 0);
          // visible
          args.push(visible ? 1 : 0);
          // ts
          args.push(Math.floor(topic.cache.last_ts / 1000));
        }

        yield N.search.execute_shadow(
          'REPLACE INTO forum_topics ' +
          '(id, content, object_id, section_uid, public, visible, ts) ' +
          'VALUES ' + values.join(', '),
          args
        );
      })
    });
  });
};
