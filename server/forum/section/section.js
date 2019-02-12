// Show topics list (section)
//
'use strict';


const _        = require('lodash');
const memoize  = require('promise-memoize');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid: { type: 'integer', required: true },
    topic_hid:   { type: 'integer', required: false },
    $query:      {
      type: 'object',
      properties: {
        prev: { 'enum': [ '' ] },
        next: { 'enum': [ '' ] }
      },
      required: false,
      additionalProperties: false
    }
  });

  let buildTopicIdsBefore = require('./list/_build_topic_ids_before.js')(N);
  let buildTopicIdsAfter  = require('./list/_build_topic_ids_after.js')(N);


  let fetchSection = memoize(id =>
    N.models.forum.Section.findById(id).lean(true).exec(), { maxAge: 60000 });


  async function buildTopicsIdsAndGetOffset(env) {
    let prev = false, next = false;

    if (env.params.$query) {
      let query = env.params.$query;

      prev = typeof query.prev !== 'undefined';
      next = typeof query.next !== 'undefined';
    }

    let statuses = _.without(env.data.topics_visible_statuses, N.models.forum.Topic.statuses.PINNED);
    let limit_direction = prev || next;
    let current_topic;

    env.data.select_topics_start  = null;

    let results = [];

    if (env.params.topic_hid) {
      current_topic = await N.models.forum.Topic.findOne({
        section: env.data.section._id,
        hid:     env.params.topic_hid,
        st:      { $in: statuses }
      });

      if (current_topic) {
        env.data.select_topics_start = current_topic[env.user_info.hb ? 'cache_hb' : 'cache'].last_post;
        results.push(current_topic._id);
      }
    }

    if (!limit_direction || prev) {
      env.data.select_topics_before = env.data.topics_per_page;
      await buildTopicIdsBefore(env);
      results = env.data.topics_ids.slice(0).concat(results);
    }

    if (!limit_direction || next) {
      env.data.select_topics_after = env.data.topics_per_page;
      await buildTopicIdsAfter(env);
      results = results.concat(env.data.topics_ids);
    }

    env.data.topics_ids = results;
  }

  // Subcall forum.topic_list
  //
  N.wire.on(apiPath, async function subcall_topic_list(env) {
    env.data.section_hid         = env.params.section_hid;
    env.data.build_topics_ids    = buildTopicsIdsAndGetOffset;
    env.data.topics_per_page     = await env.extras.settings.fetch('topics_per_page');

    return N.wire.emit('internal:forum.topic_list', env);
  });


  // Fetch pagination
  //
  N.wire.after(apiPath, async function fetch_pagination(env) {
    let statuses = _.without(env.data.topics_visible_statuses, N.models.forum.Topic.statuses.PINNED);

    //
    // Count total amount of visible topics in the section
    //
    let counters_by_status = await Promise.all(
      statuses.map(st =>
        N.models.forum.Topic
            .where('section').equals(env.data.section._id)
            .where('st').equals(st)
            .countDocuments()
      )
    );

    let pinned_count = env.data.topics_visible_statuses.indexOf(N.models.forum.Topic.statuses.PINNED) === -1 ?
                       0 :
                       await N.models.forum.Topic
                               .where('section').equals(env.data.section._id)
                               .where('st').equals(N.models.forum.Topic.statuses.PINNED)
                               .countDocuments();

    let topic_count = _.sum(counters_by_status) + pinned_count;

    //
    // Count an amount of visible topics before the first one
    //
    let topic_offset = 0;

    // if first topic is pinned, it's a first page and topic_offset is zero
    if (env.data.topics.length && env.data.topics[0].st !== N.models.forum.Topic.statuses.PINNED) {
      let cache        = env.user_info.hb ? 'cache_hb' : 'cache';
      let last_post_id = env.data.topics[0][cache].last_post;

      let counters_by_status = await Promise.all(
        statuses.map(st =>
          N.models.forum.Topic
              .where(`${cache}.last_post`).gt(last_post_id)
              .where('section').equals(env.data.section._id)
              .where('st').equals(st)
              .countDocuments()
        )
      );

      topic_offset = _.sum(counters_by_status) + pinned_count;
    }

    env.res.pagination = {
      total:        topic_count,
      per_page:     env.data.topics_per_page,
      chunk_offset: topic_offset
    };
  });


  // Fetch visible sub-sections
  //
  N.wire.after(apiPath, function fetch_visible_subsections(env) {
    return N.wire.emit('internal:forum.subsections_fill', env);
  });


  // Fill subscription type
  //
  N.wire.after(apiPath, async function fill_subscription(env) {
    if (!env.user_info.is_member) {
      env.res.subscription = null;
      return;
    }

    let subscription = await N.models.users.Subscription
                                .findOne({ user: env.user_info.user_id, to: env.data.section._id })
                                .lean(true);

    env.res.subscription = subscription ? subscription.type : null;
  });


  // Fill breadcrumbs info
  //
  N.wire.after(apiPath, async function fill_topic_breadcrumbs(env) {

    if (!env.data.section) return;

    let parents = await N.models.forum.Section.getParentList(env.data.section._id);

    await N.wire.emit('internal:forum.breadcrumbs_fill', { env, parents });
  });


  // Get parent section
  //
  N.wire.after(apiPath, async function fill_parent_hid(env) {
    let parents = await N.models.forum.Section.getParentList(env.data.section._id);

    if (!parents.length) return;

    let section = await fetchSection(parents[parents.length - 1]);

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
  N.wire.after(apiPath, async function fill_prev_next(env) {
    env.res.head = env.res.head || {};

    let cache    = env.user_info.hb ? 'cache_hb' : 'cache';
    let statuses = _.without(env.data.topics_visible_statuses, N.models.forum.Topic.statuses.PINNED);

    //
    // Fetch topic after last one, turn it into a link to the next page
    //
    if (env.data.topics.length > 0) {
      let last_post_id = env.data.topics[env.data.topics.length - 1][cache].last_post;

      let topic_data = await N.models.forum.Topic.findOne()
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
        }) + '?next';
      }
    }

    //
    // Fetch topic before first one, turn it into a link to the previous page;
    // (there is no previous page if the first topic is pinned)
    //
    if (env.data.topics.length > 0 &&
        env.data.topics[0].st !== N.models.forum.Topic.statuses.PINNED) {

      let last_post_id = env.data.topics[0][cache].last_post;

      let topic_data = await N.models.forum.Topic.findOne()
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
        }) + '?prev';
      }
    }

    //
    // Fetch last topic for the "move to bottom" button
    //
    if (env.data.topics.length > 0) {
      let topic_data = await N.models.forum.Topic.findOne()
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
