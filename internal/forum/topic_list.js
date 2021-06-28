// Get topics list with all data needed to render
//
// in:
//
// - env.data.section_hid
// - env.data.build_topics_ids (env, callback) - should fill `env.data.topics_ids` with correct sorting order
//
// out:
//
//   env:
//     res:
//       settings: ...
//       topic: ...         # sanitized, with restricted fields
//       posts: ...         # array, sanitized, with restricted fields
//       section: ...       # with restricted fields
//       own_bookmarks: ... # array of topics ids bookmarked by user
//       read_marks:        # hash with keys as topic ids and values is object
//                          # with fields `isNew`, `next` and `position`
//       subscriptions:     # array of topics ids subscribed by user
//     data:
//       topics_visible_statuses: ...
//       settings: ...
//       topic: ...
//       section: ...
//
'use strict';


const sanitize_topic   = require('nodeca.forum/lib/sanitizers/topic');
const sanitize_section = require('nodeca.forum/lib/sanitizers/section');

const fields = require('./_fields/topic_list.js');


module.exports = function (N, apiPath) {

  // Shortcuts
  const Section = N.models.forum.Section;
  const Topic = N.models.forum.Topic;


  // Fetch section
  //
  N.wire.before(apiPath, async function fetch_section(env) {
    let section = await Section.findOne({ hid: env.data.section_hid }).lean(true);

    if (!section) throw N.io.NOT_FOUND;
    if (!section.is_enabled) throw N.io.NOT_FOUND;

    env.data.section = section;
  });


  // Fetch and fill permissions
  //
  N.wire.before(apiPath, async function fetch_and_fill_permissions(env) {
    env.extras.settings.params.section_id = env.data.section._id;

    env.res.settings = env.data.settings = await env.extras.settings.fetch(fields.settings);
  });


  // Check section access permission
  //
  N.wire.before(apiPath, function check_access_permissions(env) {
    if (!env.data.settings.forum_can_view) throw N.io.FORBIDDEN;
  });


  // Define visible topic statuses
  //
  N.wire.before(apiPath, function define_visible_statuses(env) {
    let statuses = Topic.statuses;

    env.data.topics_visible_statuses = statuses.LIST_VISIBLE.slice(0);

    if (env.data.settings.forum_mod_can_delete_topics) {
      env.data.topics_visible_statuses.push(statuses.DELETED);
    }

    if (env.data.settings.forum_mod_can_see_hard_deleted_topics) {
      env.data.topics_visible_statuses.push(statuses.DELETED_HARD);
    }

    if (env.data.settings.can_see_hellbanned || env.user_info.hb) {
      env.data.topics_visible_statuses.push(statuses.HB);
    }
  });


  // Get topics ids
  //
  N.wire.before(apiPath, async function get_topics_ids(env) {
    await env.data.build_topics_ids(env);
  });


  // Fetch and sort topics
  //
  N.wire.on(apiPath, async function fetch_and_sort_topics(env) {

    let topics = await Topic.find()
                        .where('_id').in(env.data.topics_ids)
                        .where('st').in(env.data.topics_visible_statuses)
                        .where('section').equals(env.data.section._id)
                        .lean(true);

    env.data.topics = [];

    // Sort in `env.data.topics_ids` order.
    // May be slow on large topics volumes
    for (let id of env.data.topics_ids) {
      let topic = topics.find(t => t._id.equals(id));

      if (topic) {
        env.data.topics.push(topic);
      }
    }
  });


  // Check if section is publicly visible,
  // only allow bookmarks in public sections
  //
  N.wire.after(apiPath, async function check_section_public(env) {
    let access_env = { params: {
      sections: env.data.section,
      user_info: '000000000000000000000000' // guest
    } };

    await N.wire.emit('internal:forum.access.section', access_env);

    if (access_env.data.access_read) {
      env.res.section_is_public = true;
    }
  });


  // Fill bookmarks
  //
  N.wire.after(apiPath, async function fill_bookmarks(env) {
    let postIds = env.data.topics.map(topic => topic.cache.first_post);

    let bookmarks = await N.models.users.Bookmark.find()
                              .where('user').equals(env.user_info.user_id)
                              .where('src').in(postIds)
                              .lean(true);

    env.res.own_bookmarks = bookmarks.map(b => b.src);
  });


  // Fill subscriptions for section topics
  //
  N.wire.after(apiPath, async function fill_subscriptions(env) {
    if (!env.user_info.is_member) {
      env.res.subscriptions = [];
      return;
    }

    let subscriptions = await N.models.users.Subscription.find()
                          .where('user').equals(env.user_info.user_id)
                          .where('to').in(env.data.topics_ids)
                          .where('type').in(N.models.users.Subscription.types.LIST_SUBSCRIBED)
                          .lean(true);

    env.res.subscriptions = subscriptions.map(s => s.to);
  });


  // Fill `isNew`, `next` and `position` markers
  //
  N.wire.after(apiPath, async function fill_read_marks(env) {
    let data = [];

    env.data.topics.forEach(topic => {
      data.push({
        categoryId: topic.section,
        contentId: topic._id,
        lastPostNumber: topic.last_post_counter,
        lastPostTs: topic.cache.last_ts
      });
    });

    env.res.read_marks = await N.models.users.Marker.info(env.user_info.user_id, data);
  });


  // Collect users
  //
  N.wire.after(apiPath, function collect_users(env) {
    env.data.users = env.data.users || [];

    env.data.topics.forEach(function (topic) {
      env.data.users.push(topic.cache.first_user);
      env.data.users.push(topic.cache.last_user);

      if (topic.del_by) {
        env.data.users.push(topic.del_by);
      }
    });
  });


  // Check if any users are ignored
  //
  N.wire.after(apiPath, async function check_ignores(env) {
    let users = env.data.topics.map(topic => topic.cache.first_user).filter(Boolean);

    // don't fetch `_id` to load all data from composite index
    let ignored = await N.models.users.Ignore.find()
                            .where('from').equals(env.user_info.user_id)
                            .where('to').in(users)
                            .select('from to -_id')
                            .lean(true);

    env.res.ignored_users = env.res.ignored_users || {};

    ignored.forEach(row => {
      env.res.ignored_users[row.to] = true;
    });
  });


  // Sanitize and fill topics
  //
  N.wire.after(apiPath, async function topics_sanitize_and_fill(env) {
    env.res.topics  = await sanitize_topic(N, env.data.topics, env.user_info);
    env.res.section = await sanitize_section(N, env.data.section, env.user_info);
  });
};
