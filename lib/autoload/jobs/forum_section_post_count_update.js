// Recalculate post count in section
//
'use strict';


const ObjectId = require('mongoose').Types.ObjectId;


module.exports = function (N) {
  N.wire.on('init:jobs', function register_forum_section_post_count_update() {
    N.queue.registerTask({
      name: 'forum_section_post_count_update',
      pool: 'hard',

      // 15 minute delay by default
      postponeDelay: 15 * 60 * 1000,

      taskID: section_id => String(section_id),

      async process(section_str_id) {
        let topic_statuses = N.models.forum.Topic.statuses;
        let section_id = new ObjectId(section_str_id);

        // Get visible topic and post count in section
        let visible_cnt = await N.models.forum.Topic
                                  .aggregate([ {
                                    $match: {
                                      section: section_id,
                                      st: { $in: topic_statuses.LIST_VISIBLE }
                                    }
                                  } ])
                                  .group({
                                    _id: null,
                                    post_count: { $sum: '$cache.post_count' },
                                    topic_count: { $sum: 1 }
                                  })
                                  .exec();

        visible_cnt = visible_cnt[0] || { post_count: 0, topic_count: 0 };

        // Get hb topic and post count in section
        let hb_cnt = await N.models.forum.Topic
                              .aggregate([ {
                                $match: {
                                  section: section_id,
                                  st: topic_statuses.HB
                                }
                              } ])
                              .group({
                                _id: null,
                                post_count: { $sum: '$cache.post_count' },
                                topic_count: { $sum: 1 }
                              })
                              .exec();

        hb_cnt = hb_cnt[0] || { post_count: 0, topic_count: 0 };

        // Get topic and post count in children sections
        let children_cnt = await N.models.forum.Section
                                    .aggregate([
                                      { $match: { parent: section_id } }
                                    ])
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
          'cache.post_count': visible_cnt.post_count + children_cnt.post_count,
          'cache_hb.post_count': visible_cnt.post_count + hb_cnt.post_count + children_cnt.post_count_hb,
          'cache.topic_count': visible_cnt.topic_count + children_cnt.topic_count,
          'cache_hb.topic_count': visible_cnt.topic_count + hb_cnt.topic_count + children_cnt.topic_count_hb
        };

        let section = await N.models.forum.Section.findOneAndUpdate({ _id: section_id }, update_data);

        if (section?.parent) {
          // Postpone parent count update
          N.queue.forum_section_post_count_update(section.parent).postpone();
        }
      }
    });
  });
};
