// Get forum topics created by a user
//
// In:
//
// - params.user_id
// - params.user_info
// - params.start - starting point (topic id, optional, default: most recent one)
// - params.before - number of visible topics fetched before start
// - params.after - number of visible topics fetched after start
//
// Out:
//
// - results - array of results, each one is { topic, section }
// - users - array of user ids needed to fetch
// - reached_top
// - reached_bottom
// - last_item_id
// - pagination
//

'use strict';


const _                = require('lodash');
const sanitize_topic   = require('nodeca.forum/lib/sanitizers/topic');
const sanitize_section = require('nodeca.forum/lib/sanitizers/section');


module.exports = function (N, apiPath) {

  // Separate method used to return number of items
  //
  N.wire.on(apiPath + ':count', async function activity_forum_topics_count(locals) {
    locals.count = await N.models.forum.UserTopicCount.get(locals.params.user_id, locals.params.user_info);
  });


  // Initialize internal state
  //
  N.wire.before(apiPath, { priority: -20 }, async function init_activity_env(locals) {
    locals.sandbox = {};

    // get visible sections
    locals.sandbox.visible_sections = await N.models.forum.Section.getVisibleSections(
      locals.params.user_info.usergroups
    );

    // get visible statuses
    locals.sandbox.countable_statuses = N.models.forum.Topic.statuses.LIST_VISIBLE.slice(0);

    // NOTE: do not count deleted topics, since permissions may be different
    //       for different sections, depending on usergroup and moderator
    //       permissions; deleted topics will be checked and filtered out later
    if (locals.params.user_info.hb) locals.sandbox.countable_statuses.push(N.models.forum.Topic.statuses.HB);
  });


  // Find first visible topic
  //
  N.wire.before(apiPath, { parallel: true }, async function find_topic_range_before(locals) {
    if (!locals.params.before) {
      locals.sandbox.first_id = locals.params.start;
      return;
    }

    let query = N.models.forum.Topic.findOne()
                               .where('cache.first_user').equals(locals.params.user_id)
                               .where('section').in(locals.sandbox.visible_sections)
                               .where('st').in(locals.sandbox.countable_statuses)
                               .skip(locals.params.before)
                               .sort('_id')
                               .select('_id');

    if (locals.params.start) {
      query = query.where('_id').gt(locals.params.start);
    }

    let first_topic = await query.lean(true);

    if (!first_topic) {
      locals.sandbox.first_id = null;
      return;
    }

    locals.sandbox.first_id = String(first_topic._id);
  });


  // Find last visible topic
  //
  N.wire.before(apiPath, { parallel: true }, async function find_topic_range_after(locals) {
    if (!locals.params.after) {
      locals.sandbox.last_id = locals.params.start;
      return;
    }

    let query = N.models.forum.Topic.findOne()
                               .where('cache.first_user').equals(locals.params.user_id)
                               .where('section').in(locals.sandbox.visible_sections)
                               .where('st').in(locals.sandbox.countable_statuses)
                               .skip(locals.params.after)
                               .sort('-_id')
                               .select('_id');

    if (locals.params.start) {
      query = query.where('_id').lt(locals.params.start);
    }

    let last_topic = await query.lean(true);

    if (!last_topic) {
      locals.sandbox.last_id = null;
      return;
    }

    locals.sandbox.last_id = String(last_topic._id);
  });


  // Find topics
  //
  N.wire.on(apiPath, async function find_topics(locals) {
    let query = N.models.forum.Topic.find()
                    .where('cache.first_user').equals(locals.params.user_id)
                    .where('section').in(locals.sandbox.visible_sections)
                    .sort('-_id');

    if (locals.params.before) {
      query = locals.sandbox.first_id ? query.where('_id').lt(locals.sandbox.first_id) : query;
    } else {
      query = locals.params.start ? query.where('_id').lte(locals.params.start) : query;
    }

    if (locals.params.after) {
      query = locals.sandbox.last_id ? query.where('_id').gt(locals.sandbox.last_id) : query;
    } else {
      query = locals.params.start ? query.where('_id').gte(locals.params.start) : query;
    }

    locals.sandbox.topics = await query.lean(true);

    locals.sandbox.sections = await N.models.forum.Section.find()
                                        .where('_id')
                                        .in(_.uniq(locals.sandbox.topics.map(topic => String(topic.section))))
                                        .lean(true);

    locals.reached_top    = !locals.sandbox.first_id;
    locals.reached_bottom = !locals.sandbox.last_id;
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

    locals.sandbox.sections = Object.values(sections_used);
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


  // Fetch pagination and last topic id
  //
  N.wire.after(apiPath, async function fetch_pagination(locals) {
    //
    // Count total amount of visible topics
    //
    let topic_count = await N.models.forum.Topic.countDocuments()
                                .where('cache.first_user').equals(locals.params.user_id)
                                .where('section').in(locals.sandbox.visible_sections)
                                .where('st').in(locals.sandbox.countable_statuses);

    //
    // Count an amount of visible topics before the first one
    //
    let topic_offset = 0;

    if (locals.results.length) {
      topic_offset = await N.models.forum.Topic.countDocuments()
                               .where('cache.first_user').equals(locals.params.user_id)
                               .where('section').in(locals.sandbox.visible_sections)
                               .where('st').in(locals.sandbox.countable_statuses)
                               .where('_id').gt(locals.results[0].topic._id);
    }

    let last_topic = await N.models.forum.Topic.findOne()
                               .where('cache.first_user').equals(locals.params.user_id)
                               .where('section').in(locals.sandbox.visible_sections)
                               .where('st').in(locals.sandbox.countable_statuses)
                               .sort('_id')
                               .select('_id')
                               .lean(true);

    locals.pagination = {
      total:        topic_count,
      per_page:     20, // unused
      chunk_offset: topic_offset
    };

    locals.last_item_id = last_topic?._id;
  });
};
