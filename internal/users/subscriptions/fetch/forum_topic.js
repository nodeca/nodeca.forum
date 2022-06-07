// Fetch topics for subscriptions
//
// In:
//
//  - params.user_info
//  - params.subscriptions
//  - params.count_only
//
// Out:
//
//  - count
//  - items
//  - missed_subscriptions - list of subscriptions for deleted topics
//                           (those subscriptions will be deleted later)
//  - res   - misc data (specific to template, merged with env.res)
//
'use strict';


const _                = require('lodash');
const sanitize_topic   = require('nodeca.forum/lib/sanitizers/topic');
const sanitize_section = require('nodeca.forum/lib/sanitizers/section');


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, async function subscriptions_fetch_topics(locals) {
    let subs = locals.params.subscriptions.filter(s => s.to_type === N.shared.content_type.FORUM_TOPIC);

    locals.count = subs.length;
    locals.res = {};
    if (!locals.count || locals.params.count_only) return;

    // Fetch topics
    let topics = await N.models.forum.Topic.find().where('_id').in(subs.map(s => s.to)).lean(true);

    // Fetch sections
    let sections = await N.models.forum.Section.find().where('_id').in(topics.map(t => t.section)).lean(true);

    // Check permissions subcall
    //
    let access_env = { params: {
      topics,
      user_info: locals.params.user_info,
      preload: sections
    } };

    await N.wire.emit('internal:forum.access.topic', access_env);

    topics = topics.reduce(function (acc, topic, i) {
      if (access_env.data.access_read[i]) {
        acc.push(topic);
      }

      return acc;
    }, []);


    // Sanitize topics
    topics = await sanitize_topic(N, topics, locals.params.user_info);

    // Sanitize sections
    sections = await sanitize_section(N, sections, locals.params.user_info);

    // Fetch read marks
    //
    let data = topics.map(topic => ({
      categoryId: topic.section,
      contentId: topic._id,
      lastPostNumber: topic.cache.last_post_hid,
      lastPostTs: topic.cache.last_ts
    }));

    let read_marks = await N.models.users.Marker.info(locals.params.user_info.user_id, data, 'forum_topic');
    locals.res.read_marks = Object.assign(locals.res.read_marks || {}, read_marks);

    topics = _.keyBy(topics, '_id');
    sections = _.keyBy(sections, '_id');

    locals.res.forum_topics = topics;
    locals.res.forum_sections = Object.assign(locals.res.forum_sections || {}, sections);
    locals.items = subs;


    // Fill missed subscriptions (for deleted topic)
    //
    let missed = subs.filter(s => !topics[s.to] || !sections[topics[s.to].section]);

    locals.missed_subscriptions = locals.missed_subscriptions || [];
    locals.missed_subscriptions = locals.missed_subscriptions.concat(missed);
  });
};
