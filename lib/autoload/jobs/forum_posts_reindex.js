// Reindex forum posts
//
'use strict';


const Promise  = require('bluebird');
const crypto   = require('crypto');
const _        = require('lodash');
const Queue    = require('idoit');


const CHUNKS_TO_ADD    = 100;
const CHUNKS_MIN_COUNT = 1;
const POSTS_PER_CHUNK  = 100;


// returns first 52 bits of sha256 hash as an integer
function id_hash(objectid) {
  let buf = new Buffer(objectid.toString(), 'hex');

  return parseInt(crypto.createHash('sha256').update(buf).digest('hex').slice(0, 13), 16);
}


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
      name: 'forum_posts_reindex_chunk',
      pool: 'hard',
      removeDelay: 3600,
      process: Promise.coroutine(function* (ids) {
        N.logger.info(`Reindexing forum posts ${ids[0]}-${ids[ids.length - 1]} - ${ids.length} found`);

        let posts = yield N.models.forum.Post.find()
                              .where('_id').in(ids)
                              .lean(true);

        if (posts.length) {
          let values = [];
          let args = [];

          for (let post of posts) {
            values.push('(?,?,?,?,?)');
            args.push(id_hash(post._id));
            args.push(post.html);
            args.push(String(post._id));
            args.push(String(post.topic));
            args.push(Math.floor(post.ts / 1000));
          }

          yield N.search.execute_shadow(
            'REPLACE INTO forum_posts (id, content, objectid, parentid, ts) VALUES ' + values.join(', '),
            args
          );
        }
      })
    });
  });
};
