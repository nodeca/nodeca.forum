// Recalculate post count in section
//
'use strict';


const ObjectId = require('mongoose').Types.ObjectId;


module.exports = function (N) {
  N.wire.on('init:jobs', function register_forum_section_post_count_update() {
    N.queue.registerWorker({
      name: 'forum_section_post_count_update',

      // 15 minute delay by default
      postponeDelay: 15 * 60 * 1000,

      taskID(taskData) {
        return taskData.section_id;
      },

      * process() {
        let topic_statuses = N.models.forum.Topic.statuses;
        let section_id = new ObjectId(this.data.section_id);

        // Get visible topic and post count in section
        let visivle_cnt = yield N.models.forum.Topic
                                  .aggregate({
                                    $match: {
                                      section: section_id,
                                      st: { $in: topic_statuses.LIST_VISIBLE }
                                    }
                                  })
                                  .group({
                                    _id: null,
                                    post_count: { $sum: '$cache.post_count' },
                                    topic_count: { $sum: 1 }
                                  })
                                  .exec();

        visivle_cnt = visivle_cnt[0] || { post_count: 0, topic_count: 0 };

        // Get hb topic and post count in section
        let hb_cnt = yield N.models.forum.Topic
                              .aggregate({
                                $match: {
                                  section: section_id,
                                  st: topic_statuses.HB
                                }
                              })
                              .group({
                                _id: null,
                                post_count: { $sum: '$cache.post_count' },
                                topic_count: { $sum: 1 }
                              })
                              .exec();

        hb_cnt = hb_cnt[0] || { post_count: 0, topic_count: 0 };

        // Get topic and post count in children sections
        let children_cnt = yield N.models.forum.Section
                                    .aggregate({ $match: { parent: section_id } })
                                    .group({
                                      _id: null,
                                      post_count: { $sum: '$cache.post_count' },
                                      post_count_hb: { $sum: '$cache_hb.post_count' },
                                      topic_count: { $sum: '$cache.topic_count' },
                                      topic_count_hb: { $sum: '$cache_hb.topic_count' }
                                    })
                                    .exec();

        children_cnt = children_cnt[0] || { post_count: 0, post_count_hb: 0, topic_count: 0, topic_count_hb: 0 };

        let update_data = {
          'cache.post_count': visivle_cnt.post_count + children_cnt.post_count,
          'cache_hb.post_count': visivle_cnt.post_count + hb_cnt.post_count + children_cnt.post_count_hb,
          'cache.topic_count': visivle_cnt.topic_count + children_cnt.topic_count,
          'cache_hb.topic_count': visivle_cnt.topic_count + hb_cnt.topic_count + children_cnt.topic_count_hb
        };

        let section = yield N.models.forum.Section.findOneAndUpdate({ _id: section_id }, update_data);

        if (section && section.parent) {
          // Postpone parent count update
          N.queue.worker('forum_section_post_count_update').postpone({ section_id: section.parent });
        }
      }
    });
  });
};
