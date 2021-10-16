// Rebuild forum NNTP groups
//

'use strict';


const _        = require('lodash');
const batch    = require('batch-stream');
const ObjectId = require('mongoose').Types.ObjectId;
const stream   = require('stream');
const { pipeline } = require('stream/promises');


const POSTS_PER_CHUNK = 100;

// limit amount of posts in index
const INDEX_MAX_POSTS = 2000;

// only keep messages for the last X days in index
const INDEX_MAX_DAYS  = 60;


module.exports = function (N) {


  N.wire.on('init:jobs', function register_nntp_group_rebuild_forum() {

    N.queue.registerTask({
      name: 'nntp_group_rebuild_forum',
      pool: 'hard',
      retry: 0,
      timeout: 24 * 60 * 60 * 1000,
      taskID: group_id => `nntp_group_rebuild_forum:${group_id}`,

      async process(group_id) {
        let group = await N.models.nntp.Group.findById(group_id).lean(true);

        // clear the group
        await N.models.nntp.Group.updateOne(
          { _id: group_id },
          { $set: {
            min_index: group.last_index + 1,
            max_index: group.last_index
          } }
        );

        await N.models.nntp.Article.deleteOne({ group: group_id });


        let start_time = Date.now();
        let processed_count = 0;

        async function process_chunk(posts) {
          let topics_by_id = _.keyBy(
            await N.models.forum.Topic.find()
                      .where('_id').in(_.uniq(posts.map(post => String(post.topic))))
                      .lean(true),
            '_id'
          );


          // permission check (not using forum.access.post because posts
          // inside restricted sections should still be in index)
          posts = posts.filter(post => {
            let topic = topics_by_id[post.topic];

            // only check `st` for posts assuming st=HB,ste=VISIBLE posts aren't public
            let visible = post.st === N.models.forum.Post.statuses.VISIBLE &&
                          N.models.forum.Topic.statuses.LIST_VISIBLE.includes(topic.st);

            return visible;
          });


          // allocate index range for new posts in group
          let group = await N.models.nntp.Group.findOneAndUpdate(
            { _id: group_id },
            { $inc: { last_index: posts.length, max_index: posts.length } },
            { new: true }
          ).lean(true);


          let bulk = N.models.nntp.Article.collection.initializeUnorderedBulkOp();

          for (let i = 0; i < posts.length; i++) {
            let post  = posts[i];
            let topic = topics_by_id[post.topic];

            bulk.insert({
              _id:      new ObjectId(Math.floor(post.ts / 1000)),
              source:   post._id,
              parent:   topic._id,
              group:    group._id,
              index:    group.last_index - posts.length + i + 1
            });
          }

          if (bulk.length > 0) await bulk.execute();

          processed_count += posts.length;
        }


        let start_post = await N.models.forum.Post.findOne()
                                   .where('section').equals(group.source)
                                   .sort('-_id')
                                   .skip(INDEX_MAX_POSTS - 1)
                                   .limit(1);

        let min_id_by_count = start_post ? start_post._id : new ObjectId('000000000000000000000000');

        let min_id_by_date = new ObjectId(Date.now() / 1000 - INDEX_MAX_DAYS * 24 * 60 * 60);

        let min_id = String(min_id_by_count) > String(min_id_by_date) ?
                     min_id_by_count :
                     min_id_by_date;

        await pipeline(
          N.models.forum.Post.find()
              .where('section').equals(group.source)
              .sort('_id')
              .where('_id').gte(min_id)
              .lean(true)
              .cursor(),

          batch({ size: POSTS_PER_CHUNK }),

          new stream.Writable({
            objectMode: true,
            highWaterMark: 2, // buffer 2 chunks at most
            write(chunk, __, callback) {
              process_chunk(chunk)
                .then(() => callback(), err => callback(err));
            }
          })
        );


        let time_elapsed = ((Date.now() - start_time) / 1000).toFixed(1);

        N.logger.info(`Rebuilding group ${group.name} finished (${processed_count} posts, ${time_elapsed}s)`);
      }
    });


    N.queue.on('task:end', function nntp_group_rebuild_forum_finish(task_info) {
      let m = task_info.id.match(/^nntp_group_rebuild_forum:([a-f0-9]{24})$/);

      if (m) {
        N.live.emit('admin.nntp.rebuild_finish', {
          group_id: m[1],
          uid:      task_info.uid,
          finished: true
        });
      }
    });
  });
};
