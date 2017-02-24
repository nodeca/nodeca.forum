// Index selected topics and all posts inside those topics
//
'use strict';


const _        = require('lodash');
const Promise  = require('bluebird');
const Queue    = require('idoit');


const CHUNKS_TO_ADD    = 100;
const CHUNKS_MIN_COUNT = 1;
const POSTS_PER_CHUNK  = 100;


module.exports = function (N) {

  N.wire.on('init:jobs', function register_forum_topics_search_update_with_posts() {

    N.queue.registerTask({
      name: 'forum_topics_search_update_with_posts',
      pool: 'hard',
      baseClass: Queue.GroupTemplate,

      // 10 minute delay by default
      postponeDelay: 10 * 60 * 1000,

      init() {
        let [ ids ] = this.args;

        let tasks = ids.map(topic_id =>
          N.queue.forum_posts_search_update_by_topic(topic_id)
        );

        tasks.unshift(N.queue.forum_topics_search_update_by_ids(ids));

        this.__children_to_init__ = tasks;
      }
    });


    // Task to index forum posts from a selected topic (only used internally)
    //
    N.queue.registerTask({
      name: 'forum_posts_search_update_by_topic',
      pool: 'hard',
      baseClass: Queue.IteratorTemplate,
      taskID: () => 'forum_posts_search_update_by_topic',

      iterate: Promise.coroutine(function* (state) {
        let active_chunks = this.children_created - this.children_finished;


        // Idle if we still have more than `CHUNKS_MIN_COUNT` chunks
        //
        if (active_chunks >= CHUNKS_MIN_COUNT) return {};


        // Fetch posts _id
        //
        let query = N.models.forum.Post.find()
                        .where('topic').equals(this.args[0])
                        .select('_id')
                        .sort({ _id: -1 })
                        .limit(POSTS_PER_CHUNK * CHUNKS_TO_ADD)
                        .lean(true);

        // If state is present it is always smaller than max _id
        if (state) {
          query.where('_id').lt(state);
        }

        let posts = yield query;


        // Check finished
        //
        if (!posts.length) return null;


        // Add chunks
        //
        let chunks = _.chunk(posts.map(p => String(p._id)), POSTS_PER_CHUNK)
                      .map(ids => N.queue.forum_posts_search_update_by_ids(ids));

        return {
          tasks: chunks,
          state: String(posts[posts.length - 1]._id)
        };
      })
    });
  });
};
