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

var _                = require('lodash');
var sanitize_topic   = require('nodeca.forum/lib/sanitizers/topic');
var sanitize_section = require('nodeca.forum/lib/sanitizers/section');

var fields = require('./_fields/topic_list.js');

module.exports = function (N, apiPath) {

  // Shortcuts
  var Section = N.models.forum.Section;
  var Topic = N.models.forum.Topic;


  // Fetch section
  //
  N.wire.before(apiPath, function* fetch_section(env) {
    let section = yield Section.findOne({ hid: env.data.section_hid }).lean(true);

    if (!section) { throw N.io.NOT_FOUND; }

    env.data.section = section;
  });


  // Fetch and fill permissions
  //
  N.wire.before(apiPath, function* fetch_and_fill_permissions(env) {
    env.extras.settings.params.section_id = env.data.section._id;

    env.res.settings = env.data.settings = yield env.extras.settings.fetch(fields.settings);
  });


  // Check section access permission
  //
  N.wire.before(apiPath, function check_access_permissions(env) {
    if (!env.data.settings.forum_can_view) {
      return N.io.FORBIDDEN;
    }
  });


  // Define visible topic statuses
  //
  N.wire.before(apiPath, function define_visible_statuses(env) {
    var statuses = Topic.statuses;

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
  N.wire.before(apiPath, function get_topics_ids(env, callback) {
    env.data.build_topics_ids(env, callback);
  });


  // Fetch and sort topics
  //
  N.wire.on(apiPath, function* fetch_and_sort_topics(env) {

    let topics = yield Topic.find()
                        .where('_id').in(env.data.topics_ids)
                        .where('st').in(env.data.topics_visible_statuses)
                        .where('section').equals(env.data.section._id)
                        .lean(true);

    env.data.topics = [];

    // Sort in `env.data.topics_ids` order.
    // May be slow on large topics volumes
    env.data.topics_ids.forEach(id => {
      var topic = _.find(topics, t => t._id.equals(id));

      if (topic) {
        env.data.topics.push(topic);
      }
    });
  });


  // Fill bookmarks
  //
  N.wire.after(apiPath, function* fill_bookmarks(env) {
    var postIds = env.data.topics.map(topic => topic.cache.first_post);

    let bookmarks = yield N.models.forum.PostBookmark.find()
                              .where('user_id').equals(env.user_info.user_id)
                              .where('post_id').in(postIds)
                              .lean(true);

    env.res.own_bookmarks = _.pluck(bookmarks, 'post_id');
  });


  // Fill subscriptions for section topics
  //
  N.wire.after(apiPath, function* fill_subscriptions(env) {
    if (env.user_info.is_guest) {
      env.res.subscriptions = [];
      return;
    }

    let subscriptions = yield N.models.users.Subscription.find()
                          .where('user_id').equals(env.user_info.user_id)
                          .where('to').in(env.data.topics_ids)
                          .where('type').in(N.models.users.Subscription.types.LIST_SUBSCRIBED)
                          .lean(true);

    env.res.subscriptions = _.pluck(subscriptions, 'to');
  });


  // Fill `isNew`, `next` and `position` markers
  //
  N.wire.after(apiPath, function fill_read_marks(env, callback) {
    var data = [];

    env.data.topics.forEach(function (topic) {
      data.push({
        categoryId: topic.section,
        contentId: topic._id,
        lastPostNumber: topic.last_post_hid,
        lastPostTs: topic.cache.last_ts
      });
    });

    N.models.users.Marker.info(env.user_info.user_id, data, function (err, marks) {
      if (err) {
        callback(err);
        return;
      }

      env.res.read_marks = marks;
      callback();
    });
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


  // Sanitize and fill topics
  //
  N.wire.after(apiPath, function* topics_sanitize_and_fill(env) {
    env.res.topics  = yield sanitize_topic(N, env.data.topics, env.user_info);
    env.res.section = yield sanitize_section(N, env.data.section, env.user_info);
  });
};
