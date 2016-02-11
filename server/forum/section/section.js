// Show topics list (section)
//
'use strict';


const memoizee  = require('memoizee');
const _         = require('lodash');
const thenify   = require('thenify');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid: { type: 'integer', required: true },
    topic_hid:   { type: 'integer', required: false }
  });

  let buildTopicsIds = require('./list/_build_topics_ids_by_range.js')(N);


  let fetchSection = thenify(memoizee(
    function (id, callback) {
      N.models.forum.Section.findById(id)
        .lean(true)
        .exec(callback);
    },
    {
      async:      true,
      maxAge:     60000, // cache TTL = 60 seconds
      primitive:  true   // params keys are calculated as toString
    }
  ));

  function buildTopicsIdsAndGetOffset(env) {
    return env.extras.settings.fetch('topics_per_page').then(topics_per_page => {
      env.data.select_posts_start  = null;
      env.data.select_posts_before = topics_per_page;
      env.data.select_posts_after  = topics_per_page;

      if (env.params.topic_hid) {
        return N.models.forum.Topic.findOne({
          section: env.data.section._id,
          hid:     env.params.topic_hid,
          st:      { $in: env.data.topics_visible_statuses }
        }).then(topic => {

          if (topic) {
            env.data.select_posts_start = topic[env.user_info.hb ? 'cache_hb' : 'cache'].last_post;
          }
        });
      }
    }).then(() => buildTopicsIds(env));
  }

  // Subcall forum.topic_list
  //
  N.wire.on(apiPath, function subcall_topic_list(env) {
    env.data.section_hid         = env.params.section_hid;
    env.data.build_topics_ids    = buildTopicsIdsAndGetOffset;

    return N.wire.emit('internal:forum.topic_list', env);
  });


  // Fetch pagination
  //
  N.wire.after(apiPath, function* fetch_pagination(env) {
    let topics_per_page = yield env.extras.settings.fetch('topics_per_page');

    let statuses = _.without(env.data.topics_visible_statuses, N.models.forum.Topic.statuses.PINNED);

    let counters_by_status;

    //
    // Count total amount of visible topics in the section
    //
    counters_by_status = yield statuses.map(
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

    if (env.data.topics.length) {
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

    env.data.pagination = {
      total:        topic_count,
      per_page:     topics_per_page,
      chunk_offset: topic_offset
    };
  });


  // Fill page info
  //
  N.wire.after(apiPath, function fill_page(env) {
    env.res.pagination = env.data.pagination;
  });


  // Fetch visible sub-sections
  //
  N.wire.after(apiPath, function fetch_visible_subsections(env) {
    return N.wire.emit('internal:forum.subsections_fill', env);
  });


  // Fill subscription type
  //
  N.wire.after(apiPath, function* fill_subscription(env) {
    if (env.user_info.is_guest) {
      env.res.subscription = null;
      return;
    }

    let subscription = yield N.models.users.Subscription
                                .findOne({ user_id: env.user_info.user_id, to: env.data.section._id })
                                .lean(true);

    env.res.subscription = subscription ? subscription.type : null;
  });


  // Fill breadcrumbs info
  //
  N.wire.after(apiPath, function* fill_topic_breadcrumbs(env) {

    if (!env.data.section) return;

    let parents = yield N.models.forum.Section.getParentList(env.data.section._id);

    yield N.wire.emit('internal:forum.breadcrumbs_fill', { env, parents });
  });


  // Get parent section
  //
  N.wire.after(apiPath, function* fill_parent_hid(env) {
    let parents = yield N.models.forum.Section.getParentList(env.data.section._id);

    if (!parents.length) return;

    let section = yield fetchSection(parents[parents.length - 1]);

    if (!section) return;

    env.res.section_level = parents.length;
    env.res.parent_hid = section.hid;
  });


  // Fill head meta
  //
  N.wire.after(apiPath, function fill_head_and_breadcrumbs(env) {
    env.res.head = env.res.head || {};
    env.res.head.title = env.data.section.title;

    if (env.params.topic_hid) {
      env.res.head.robots = 'noindex,follow';
    }
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
    if (env.data.topics.length > 0) {
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
    if (env.data.topics.length > 0 && env.data.pagination.chunk_offset > 0) {
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

    //
    // Fetch last topic for the "move to bottom" button
    //
    if (env.data.topics.length > 0) {
      let topic_data = yield N.models.forum.Topic.findOne()
                                 .where('section').equals(env.data.section._id)
                                 .where('st').in(statuses)
                                 .select('hid')
                                 .sort(`${cache}.last_post`)
                                 .lean(true);

      if (topic_data) {
        env.res.last_topic_hid = topic_data.hid;
      }
    }
  });
};
