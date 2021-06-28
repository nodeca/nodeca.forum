// Get forum posts created by a user
//
// In:
//
// - params.user_id
// - params.user_info
// - params.start - starting point (post id, optional, default: most recent one)
// - params.before - number of visible posts fetched before start
// - params.after - number of visible posts fetched after start
//
// Out:
//
// - results - array of results, each one is { post, topic, section }
// - users - array of user ids needed to fetch
// - reached_top
// - reached_bottom
//

'use strict';


const _                = require('lodash');
const sanitize_topic   = require('nodeca.forum/lib/sanitizers/topic');
const sanitize_section = require('nodeca.forum/lib/sanitizers/section');
const sanitize_post    = require('nodeca.forum/lib/sanitizers/post');


module.exports = function (N, apiPath) {

  // Separate method used to return number of items
  //
  N.wire.on(apiPath + ':count', async function activity_forum_posts_count(locals) {
    locals.count = await N.models.forum.UserPostCount.get(locals.params.user_id, locals.params.user_info);
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
    locals.sandbox.countable_statuses = [ N.models.forum.Post.statuses.VISIBLE ];

    // NOTE: do not count deleted posts, since permissions may be different
    //       for different sections, depending on usergroup and moderator
    //       permissions; deleted posts will be checked and filtered out later
    if (locals.params.user_info.hb) locals.sandbox.countable_statuses.push(N.models.forum.Post.statuses.HB);
  });


  // Find first visible post
  //
  N.wire.before(apiPath, { parallel: true }, async function find_post_range_before(locals) {
    if (!locals.params.before) {
      locals.sandbox.first_id = locals.params.start;
      return;
    }

    let query = N.models.forum.Post.findOne()
                    .where('user').equals(locals.params.user_id)
                    .where('section').in(locals.sandbox.visible_sections)
                    .where('st').in(locals.sandbox.countable_statuses)
                    .where('topic_exists').equals(true)
                    .skip(locals.params.before)
                    .sort('_id')
                    .select('_id');

    if (locals.params.start) {
      query = query.where('_id').gt(locals.params.start);
    }

    let first_post = await query.lean(true);

    if (!first_post) {
      locals.sandbox.first_id = null;
      return;
    }

    locals.sandbox.first_id = String(first_post._id);
  });


  // Find last visible post
  //
  N.wire.before(apiPath, { parallel: true }, async function find_post_range_after(locals) {
    if (!locals.params.after) {
      locals.sandbox.last_id = locals.params.start;
      return;
    }

    let query = N.models.forum.Post.findOne()
                    .where('user').equals(locals.params.user_id)
                    .where('section').in(locals.sandbox.visible_sections)
                    .where('st').in(locals.sandbox.countable_statuses)
                    .where('topic_exists').equals(true)
                    .skip(locals.params.after)
                    .sort('-_id')
                    .select('_id');

    if (locals.params.start) {
      query = query.where('_id').lt(locals.params.start);
    }

    let last_post = await query.lean(true);

    if (!last_post) {
      locals.sandbox.last_id = null;
      return;
    }

    locals.sandbox.last_id = String(last_post._id);
  });


  // Find posts
  //
  N.wire.on(apiPath, async function find_posts(locals) {
    let query = N.models.forum.Post.find()
                    .where('user').equals(locals.params.user_id)
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

    locals.sandbox.posts = await query.lean(true);

    locals.sandbox.topics = await N.models.forum.Topic.find()
                                      .where('_id')
                                      .in(_.uniq(locals.sandbox.posts.map(post => String(post.topic))))
                                      .lean(true);

    locals.sandbox.sections = await N.models.forum.Section.find()
                                        .where('_id')
                                        .in(_.uniq(locals.sandbox.posts.map(post => String(post.section))))
                                        .lean(true);

    locals.reached_top    = !locals.sandbox.first_id;
    locals.reached_bottom = !locals.sandbox.last_id;
  });


  // Check permissions for each post
  //
  N.wire.on(apiPath, async function check_permissions(locals) {
    if (!locals.sandbox.posts.length) return;

    let topics_by_id   = _.keyBy(locals.sandbox.topics, '_id');
    let sections_by_id = _.keyBy(locals.sandbox.sections, '_id');

    let topics_used   = {};
    let sections_used = {};

    let access_env = { params: {
      posts: locals.sandbox.posts,
      user_info: locals.params.user_info,
      preload: [].concat(locals.sandbox.topics).concat(locals.sandbox.sections)
    } };

    await N.wire.emit('internal:forum.access.post', access_env);

    locals.sandbox.posts = locals.sandbox.posts.filter((post, idx) => {
      let topic = topics_by_id[post.topic];
      if (!topic) return;

      let section = sections_by_id[topic.section];
      if (!section) return;

      if (access_env.data.access_read[idx]) {
        topics_used[topic._id] = topic;
        sections_used[section._id] = section;
        return true;
      }

      return false;
    });

    locals.sandbox.topics   = Object.values(topics_used);
    locals.sandbox.sections = Object.values(sections_used);
  });


  // Sanitize results
  //
  N.wire.on(apiPath, async function sanitize(locals) {
    if (!locals.sandbox.posts.length) return;

    locals.sandbox.posts    = await sanitize_post(N, locals.sandbox.posts, locals.params.user_info);
    locals.sandbox.topics   = await sanitize_topic(N, locals.sandbox.topics, locals.params.user_info);
    locals.sandbox.sections = await sanitize_section(N, locals.sandbox.sections, locals.params.user_info);
  });


  // Fill results
  //
  N.wire.on(apiPath, function fill_results(locals) {
    locals.results = [];

    let topics_by_id = _.keyBy(locals.sandbox.topics, '_id');
    let sections_by_id = _.keyBy(locals.sandbox.sections, '_id');

    locals.sandbox.posts.forEach(post => {
      let topic = topics_by_id[post.topic];
      if (!topic) return;

      let section = sections_by_id[topic.section];
      if (!section) return;

      locals.results.push({ post, topic, section });
    });
  });


  // Fill users
  //
  N.wire.on(apiPath, function fill_users(locals) {
    let users = {};

    locals.results.forEach(result => {
      let post = result.post;

      if (post.user) users[post.user] = true;
      if (post.to_user) users[post.to_user] = true;
      if (post.del_by) users[post.del_by] = true;
      if (post.import_users) post.import_users.forEach(id => { users[id] = true; });
    });

    locals.users = Object.keys(users);
  });
};
