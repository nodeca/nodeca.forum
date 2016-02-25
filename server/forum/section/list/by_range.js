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
    if (env.params.after > 0 && env.data.topics.length > 0) {
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
    // Fetch topic before first one, turn it into a link to the previous page;
    // (there is no previous page if the first topic is pinned)
    //
    if (env.params.before > 0 && env.data.topics.length > 0 &&
        env.data.topics[0].st !== N.models.forum.Topic.statuses.PINNED) {

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


  // Fetch pagination
  //
  N.wire.after(apiPath, function* fetch_pagination(env) {
    let topics_per_page = yield env.extras.settings.fetch('topics_per_page');

    let statuses = _.without(env.data.topics_visible_statuses, N.models.forum.Topic.statuses.PINNED);

    //
    // Count total amount of visible topics in the section
    //
    let counters_by_status = yield statuses.map(
      st => N.models.forum.Topic
                .where('section').equals(env.data.section._id)
                .where('st').equals(st)
                .count()
    );

    let topic_count = _.sum(counters_by_status);

    //
    // Count an amount of visible topics before the first one
    //
    let topic_offset = 0;

    // if first topic is pinned, it's a first page and topic_offset is zero
    if (env.data.topics.length && env.data.topics[0].st !== N.models.forum.Topic.statuses.PINNED) {
      let cache        = env.user_info.hb ? 'cache_hb' : 'cache';
      let last_post_id = env.data.topics[0][cache].last_post;

      let counters_by_status = yield statuses.map(
        st => N.models.forum.Topic
                  .where(`${cache}.last_post`).gt(last_post_id)
                  .where('section').equals(env.data.section._id)
                  .where('st').equals(st)
                  .count()
      );

      topic_offset = _.sum(counters_by_status);
    }

    env.res.pagination = {
      total:        topic_count,
      per_page:     topics_per_page,
      chunk_offset: topic_offset
    };
  });
};
