// Fetch topics for subscriptions
//
'use strict';


const _                = require('lodash');
const sanitize_topic   = require('nodeca.forum/lib/sanitizers/topic');
const sanitize_section = require('nodeca.forum/lib/sanitizers/section');


module.exports = function (N) {

  N.wire.on('internal:users.subscriptions.fetch', function* subscriptions_fetch_topics(env) {
    let subs = _.filter(env.data.subscriptions, { to_type: N.models.users.Subscription.to_types.FORUM_TOPIC });

    // Fetch topics
    let topics = yield N.models.forum.Topic.find().where('_id').in(_.map(subs, 'to')).lean(true);


    // Check permissions subcall
    //
    let access_env = { params: { topics: topics, user_info: env.user_info } };

    yield N.wire.emit('internal:forum.access.topic', access_env);

    topics = topics.reduce(function (acc, topic, i) {
      if (access_env.data.access_read[i]) {
        acc.push(topic);
      }

      return acc;
    }, []);


    // Sanitize topics
    topics = yield sanitize_topic(N, topics, env.user_info);

    // Fetch sections
    let sections = yield N.models.forum.Section.find().where('_id').in(_.map(topics, 'section')).lean(true);

    // Sanitize sections
    sections = yield sanitize_section(N, sections, env.user_info);

    env.res.forum_topics = _.keyBy(topics, '_id');
    env.res.forum_sections = _.assign(env.res.forum_sections || {}, _.keyBy(sections, '_id'));
  });
};
