// Get forum topics created by a user
//
// In:
//
// - params.user_id
// - params.limit
// - params.user_info
//
// Out:
//
// - results
// - users
//

'use strict';


const _                = require('lodash');
const sanitize_topic   = require('nodeca.forum/lib/sanitizers/topic');
const sanitize_section = require('nodeca.forum/lib/sanitizers/section');


module.exports = function (N, apiPath) {

  // Return number of items found
  //
  N.wire.on(apiPath + ':count', async function activity_forum_topics_count(locals) {
    locals.count = await N.models.forum.UserTopicCount.get(locals.params.user_id, locals.params.user_info);
  });


  // Find topics
  //
  N.wire.on(apiPath, async function find_topics(locals) {
    locals.sandbox = locals.sandbox || {};

    locals.sandbox.topics = await N.models.forum.Topic.find()
                                      .where('cache.first_user').equals(locals.params.user_id)
                                      .sort('-_id')
                                      .lean(true);

    locals.sandbox.sections = await N.models.forum.Section.find()
                                        .where('_id')
                                        .in(_.uniq(locals.sandbox.topics.map(topic => String(topic.section))))
                                        .lean(true);
  });


  // Check permissions for each topic
  //
  N.wire.on(apiPath, async function check_permissions(locals) {
    if (!locals.sandbox.topics.length) return;

    let access_env = { params: {
      topics: locals.sandbox.topics,
      user_info: locals.params.user_info,
      preload: locals.sandbox.sections
    } };

    await N.wire.emit('internal:forum.access.topic', access_env);

    let sections_by_id = _.keyBy(locals.sandbox.sections, '_id');
    let sections_used = {};

    locals.sandbox.topics = locals.sandbox.topics.filter((topic, idx) => {
      let section = sections_by_id[topic.section];
      if (!section) return false;

      if (access_env.data.access_read[idx]) {
        sections_used[section._id] = section;
        return true;
      }

      return false;
    });

    locals.sandbox.sections = _.values(sections_used);
  });


  // Sanitize results
  //
  N.wire.on(apiPath, async function sanitize(locals) {
    if (!locals.sandbox.topics.length) return;

    locals.sandbox.topics   = await sanitize_topic(N, locals.sandbox.topics, locals.params.user_info);
    locals.sandbox.sections = await sanitize_section(N, locals.sandbox.sections, locals.params.user_info);
  });


  // Fill results
  //
  N.wire.on(apiPath, function fill_results(locals) {
    locals.results = [];

    let sections_by_id = _.keyBy(locals.sandbox.sections, '_id');

    locals.sandbox.topics.forEach(topic => {
      let section = sections_by_id[topic.section];
      if (!section) return;

      locals.results.push({ topic, section });
    });
  });


  // Fill users
  //
  N.wire.on(apiPath, function fill_users(locals) {
    let users = {};

    locals.results.forEach(result => {
      let topic = result.topic;

      if (topic.cache.first_user) users[topic.cache.first_user] = true;
      if (topic.cache.last_user) users[topic.cache.last_user] = true;
      if (topic.del_by) users[topic.del_by] = true;
    });

    locals.users = Object.keys(users);
  });
};
