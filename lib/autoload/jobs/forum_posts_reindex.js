// Reindex forum posts
//
'use strict';


const _              = require('lodash');
const Promise        = require('bluebird');
const Queue          = require('idoit');
const docid_posts    = require('nodeca.forum/lib/search/docid_posts');
const docid_topics   = require('nodeca.forum/lib/search/docid_topics');
const docid_sections = require('nodeca.forum/lib/search/docid_sections');
const userInfo       = require('nodeca.users/lib/user_info');


const CHUNKS_TO_ADD    = 100;
const CHUNKS_MIN_COUNT = 1;
const POSTS_PER_CHUNK  = 100;


module.exports = function (N) {

  N.wire.on('init:jobs', function register_forum_posts_reindex() {
    // Iterator
    //
    N.queue.registerTask({
      name: 'forum_posts_reindex',
      pool: 'hard',
      baseClass: Queue.IteratorTemplate,
      taskID: () => 'forum_posts_reindex',

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
        if (!posts.length) return null;


        // Add chunks
        //
        let chunks = _.chunk(posts.map(p => String(p._id)), POSTS_PER_CHUNK)
                      .map(ids => N.queue.forum_posts_reindex_chunk(ids));

        return {
          tasks: chunks,
          state: String(posts[posts.length - 1]._id)
        };
      }),

      init: Promise.coroutine(function* () {
        let query = N.models.forum.Post.count();

        if (this.args.length < 1 || !this.args[0]) {
          // if no min _id
          let min_post = yield N.models.forum.Post.findOne()
                                  .select('_id')
                                  .sort({ _id: 1 })
                                  .lean(true);

          this.args[0] = String(min_post._id);
        } else {
          // min _id already specified
          // (if it's not, we count all posts without extra conditions,
          // which results in faster query)
          query = query.where('_id').gte(this.args[0]);
        }

        if (this.args.length < 2 || !this.args[1]) {
          // if no max _id
          let max_post = yield N.models.forum.Post.findOne()
                                  .select('_id')
                                  .sort({ _id: -1 })
                                  .lean(true);

          this.args[1] = String(max_post._id);
        } else {
          // max _id already specified
          query = query.where('_id').lte(this.args[1]);
        }

        let post_count = yield query;

        this.total = Math.ceil(post_count / POSTS_PER_CHUNK);
      })
    });


    // Chunk
    //
    N.queue.registerTask({
      name: 'forum_posts_reindex_chunk',
      pool: 'hard',
      removeDelay: 3600,
      process: Promise.coroutine(function* (ids) {
        N.logger.info(`Reindexing forum posts ${ids[0]}-${ids[ids.length - 1]} - ${ids.length} found`);

        let posts = yield N.models.forum.Post.find()
                              .where('_id').in(ids)
                              .lean(true);

        if (!posts.length) return;

        let topics = yield N.models.forum.Topic.find()
                               .where('_id').in(_.uniq(posts.map(post => String(post.topic))))
                               .lean(true);

        let sections = yield N.models.forum.Section.find()
                                 .where('_id').in(_.uniq(topics.map(topic => String(topic.section))))
                                 .lean(true);

        let topics_by_id   = _.keyBy(topics, '_id');
        let sections_by_id = _.keyBy(sections, '_id');

        let user_info = yield userInfo(N, null);

        let access_env = { params: {
          posts,
          user_info,
          preload: [].concat(sections).concat(topics)
        } };

        yield N.wire.emit('internal:forum.access.post', access_env);

        let is_post_public = {};

        posts.forEach((post, idx) => {
          is_post_public[post._id] = access_env.data.access_read[idx] &&
                                     sections_by_id[topics_by_id[post.topic].section].is_searchable;
        });

        let values = [];
        let args = [];

        for (let post of posts) {
          let topic = topics_by_id[post.topic];

          // only check `st` for posts assuming st=HB,ste=VISIBLE posts aren't public
          let visible = post.st === N.models.forum.Post.statuses.VISIBLE &&
                        N.models.forum.Topic.statuses.LIST_VISIBLE.indexOf(topic.st) !== -1;

          values.push('(?,?,?,?,?,?,?,?)');

          args.push(
            // id
            docid_posts(N, topic.hid, post.hid),
            // content
            post.html,
            // object_id
            String(post._id),
            // topic_uid
            docid_topics(N, topic.hid),
            // section_uid
            docid_sections(N, sections_by_id[topic.section].hid),
            // public
            (is_post_public[post._id] && visible) ? 1 : 0,
            // visible
            visible ? 1 : 0,
            // ts
            Math.floor(post.ts / 1000)
          );
        }

        try {
          yield N.search.execute_shadow(
            'REPLACE INTO forum_posts ' +
            '(id, content, object_id, topic_uid, section_uid, public, visible, ts) ' +
            'VALUES ' + values.join(', '),
            args
          );
        } catch (err) {
          // check parent state (cancel doesn't explicitly finish iterator chunks),
          // if it's finished, it means task is canceled, so the error could be
          // safely ignored
          if ((yield N.queue.getTask(this.parent)).state !== 'finished') {
            throw err;
          }
        }
      })
    });
  });
};
