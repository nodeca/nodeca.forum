// Reindex all forum posts (iterator started from admin interface)
//
'use strict';


const _        = require('lodash');
const Queue    = require('idoit');


const CHUNKS_TO_ADD    = 100;
const CHUNKS_MIN_COUNT = 1;
const POSTS_PER_CHUNK  = 100;


module.exports = function (N) {

  N.wire.on('init:jobs', function register_forum_posts_search_rebuild() {

    N.queue.registerTask({
      name: 'forum_posts_search_rebuild',
      pool: 'hard',
      baseClass: Queue.IteratorTemplate,
      taskID: () => 'forum_posts_search_rebuild',

      async iterate(state) {
        // Args are filled in by init; empty args means no posts were found
        if (!this.args[0] || !this.args[1]) return null;

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

        let posts = await query;


        // Check finished
        //
        if (!posts.length) return null;


        // Add chunks
        //
        let chunks = _.chunk(posts.map(p => String(p._id)), POSTS_PER_CHUNK)
                      .map(ids => N.queue.forum_posts_search_update_by_ids(ids, { shadow: true }));

        return {
          tasks: chunks,
          state: String(posts[posts.length - 1]._id)
        };
      },

      async init() {
        let query = N.models.forum.Post.count();

        if (this.args.length < 1 || !this.args[0]) {
          // if no min _id
          let min_post = await N.models.forum.Post.findOne()
                                  .select('_id')
                                  .sort({ _id: 1 })
                                  .lean(true);

          if (!min_post) return;

          this.args[0] = String(min_post._id);
        } else {
          // min _id already specified
          // (if it's not, we count all posts without extra conditions,
          // which results in faster query)
          query = query.where('_id').gte(this.args[0]);
        }

        if (this.args.length < 2 || !this.args[1]) {
          // if no max _id
          let max_post = await N.models.forum.Post.findOne()
                                  .select('_id')
                                  .sort({ _id: -1 })
                                  .lean(true);

          if (!max_post) return;

          this.args[1] = String(max_post._id);
        } else {
          // max _id already specified
          query = query.where('_id').lte(this.args[1]);
        }

        let post_count = await query;

        this.total = Math.ceil(post_count / POSTS_PER_CHUNK);
      }
    });
  });
};
