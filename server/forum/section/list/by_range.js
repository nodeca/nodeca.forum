// Get a specified amount of topics before or after a topic with given last post id
//
'use strict';

const _ = require('lodash');


// Max topics to fetch before and after
const LIMIT = 50;

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid: {
      type: 'integer',
      required: true
    },
    last_post_id: {
      format: 'mongo',
      required: true
    },
    before: {
      type: 'integer',
      minimum: 0,
      maximum: LIMIT,
      required: true
    },
    after: {
      type: 'integer',
      minimum: 0,
      maximum: LIMIT,
      required: true
    }
  });

  var buildTopicIds = require('./_build_topics_ids_by_range.js')(N);

  // Subcall forum.topic_list
  //
  N.wire.on(apiPath, function subcall_topic_list(env) {
    env.data.section_hid         = env.params.section_hid;
    env.data.select_posts_start  = env.params.last_post_id;
    env.data.select_posts_before = env.params.before;
    env.data.select_posts_after  = env.params.after;
    env.data.build_topics_ids    = buildTopicIds;

    return N.wire.emit('internal:forum.topic_list', env);
  });


  // Fill 'prev' and 'next' links and meta tags
  //
  N.wire.after(apiPath, function* fill_prev_next(env) {
    env.res.head = env.res.head || {};

    let cache    = env.user_info.hb ? 'cache_hb' : 'cache';
    let statuses = _.without(env.data.topics_visible_statuses, N.models.forum.Topic.statuses.PINNED);

    //
    // Fetch topic after last one, turn it into a link to the next page
    //
    if (env.params.after > 0) {
      let last_post_id = env.data.topics[env.data.topics.length - 1][cache].last_post;

      let topic_data = yield N.models.forum.Topic.findOne()
                                 .where(`${cache}.last_post`).lt(last_post_id)
                                 .where('section').equals(env.data.section._id)
                                 .where('st').in(statuses)
                                 .select('hid -_id')
                                 .sort(`-${cache}.last_post`)
                                 .lean(true);

      if (topic_data) {
        env.res.head.next = N.router.linkTo('forum.section', {
          section_hid: env.params.section_hid,
          topic_hid:   topic_data.hid
        });

        env.res.next_topic_hid = topic_data.hid;
      }
    }

    //
    // Fetch topic before first one, turn it into a link to the previous page
    //
    if (env.params.before > 0) {
      let last_post_id = env.data.topics[0][cache].last_post;

      let topic_data = yield N.models.forum.Topic.findOne()
                                 .where(`${cache}.last_post`).gt(last_post_id)
                                 .where('section').equals(env.data.section._id)
                                 .where('st').in(statuses)
                                 .select('hid')
                                 .sort(`${cache}.last_post`)
                                 .lean(true);

      if (topic_data) {
        env.res.head.prev = N.router.linkTo('forum.section', {
          section_hid: env.params.section_hid,
          topic_hid:   topic_data.hid
        });

        env.res.prev_topic_hid = topic_data.hid;
      }
    }
  });
};
