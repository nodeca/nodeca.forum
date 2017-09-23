// Fetch topics for subscriptions
//
'use strict';


const _                = require('lodash');
const sanitize_topic   = require('nodeca.forum/lib/sanitizers/topic');
const sanitize_section = require('nodeca.forum/lib/sanitizers/section');


module.exports = function (N) {

  N.wire.on('internal:users.subscriptions.fetch', async function subscriptions_fetch_topics(env) {
    let subs = _.filter(env.data.subscriptions, { to_type: N.shared.content_type.FORUM_TOPIC });

    // Fetch topics
    let topics = await N.models.forum.Topic.find().where('_id').in(_.map(subs, 'to')).lean(true);

    // Fetch sections
    let sections = await N.models.forum.Section.find().where('_id').in(_.map(topics, 'section')).lean(true);

    // Check permissions subcall
    //
    let access_env = { params: {
      topics,
      user_info: env.user_info,
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
    topics = await sanitize_topic(N, topics, env.user_info);

    // Sanitize sections
    sections = await sanitize_section(N, sections, env.user_info);

    topics = _.keyBy(topics, '_id');
    sections = _.keyBy(sections, '_id');

    env.res.forum_topics = topics;
    env.res.forum_sections = _.assign(env.res.forum_sections || {}, sections);


    // Fill missed subscriptions (for deleted topic)
    //
    let missed = _.filter(subs, s => !topics[s.to] || !sections[topics[s.to].section]);

    env.data.missed_subscriptions = env.data.missed_subscriptions || [];
    env.data.missed_subscriptions = env.data.missed_subscriptions.concat(missed);
  });
};
