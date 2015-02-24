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
//     data:
//       topics_visible_statuses: ...
//       settings: ...
//       topic: ...
//       section: ...
//       own_bookmarks: ...
//

'use strict';

var _ = require('lodash');

var fields = require('./_fields/topic_list.js');

module.exports = function (N, apiPath) {

  // Shortcuts
  var Section = N.models.forum.Section;
  var Topic = N.models.forum.Topic;


  // Fetch section
  //
  N.wire.before(apiPath, function fetch_section(env, callback) {
    Section.findOne({ hid: env.data.section_hid })
        .lean(true)
        .exec(function (err, section) {

      if (err) {
        callback(err);
        return;
      }

      if (!section) {
        callback(N.io.NOT_FOUND);
        return;
      }

      env.data.section = section;
      callback();
    });
  });


  // Fetch permissions
  //
  N.wire.before(apiPath, function fetch_permissions(env, callback) {
    env.extras.settings.params.section_id = env.data.section._id;

    env.extras.settings.fetch(fields.settings, function (err, result) {
      if (err) {
        callback(err);
        return;
      }

      env.data.settings = result;
      callback();
    });
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

    env.data.topics_visible_statuses = [ statuses.OPEN, statuses.CLOSED, statuses.PINNED ];

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
  N.wire.before(apiPath, function get_posts_ids(env, callback) {
    env.data.build_topics_ids(env, callback);
  });


  // Fetch and sort topics
  //
  N.wire.on(apiPath, function fetch_and_sort_topics(env, callback) {
    var topic;

    Topic.find()
        .where('_id').in(env.data.topics_ids)
        .where('st').in(env.data.topics_visible_statuses)
        .where('section').equals(env.data.section._id)
        .lean(true)
        .exec(function (err, topics) {

      if (err) {
        callback(err);
        return;
      }

      env.data.topics = [];

      // Sort in same order with `env.data.topics_ids`. May be slow on large topics volumes
      env.data.topics_ids.forEach(function (id) {
        topic = _.find(topics, function (topic) {
          return topic._id.equals(id);
        });

        if (topic) {
          env.data.topics.push(topic);
        }
      });

      callback();
    });
  });


  // Fetch bookmarks
  //
  N.wire.after(apiPath, function fetch_bookmarks(env, callback) {
    var postIds = env.data.topics.map(function (topic) {
      return topic.cache.first_post;
    });

    N.models.forum.PostBookmark.find()
        .where('user_id').equals(env.user_info.user_id)
        .where('post_id').in(postIds)
        .lean(true)
        .exec(function (err, bookmarks) {

      if (err) {
        callback(err);
        return;
      }

      env.data.own_bookmarks = bookmarks;
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


  // Sanitize topics
  //
  N.wire.after(apiPath, function topics_sanitize(env) {
    env.data.topics_out = [];

    env.data.topics.forEach(function (post) {
      var restrictedTopic = _.pick(post, fields.topic);

      if (restrictedTopic.st === Topic.statuses.HB && !env.data.settings.can_see_hellbanned) {
        restrictedTopic.st = restrictedTopic.ste;
        delete restrictedTopic.ste;
      }

      if (restrictedTopic.cache_hb && (env.user_info.hb || env.data.settings.can_see_hellbanned)) {
        restrictedTopic.cache = restrictedTopic.cache_hb;
      }

      delete restrictedTopic.cache_hb;

      env.data.topics_out.push(restrictedTopic);
    });
  });


  // Sanitize and fill section
  //
  N.wire.after(apiPath, function section_sanitize(env) {
    var section = _.pick(env.data.section, fields.section);

    if (section.cache_hb && (env.user_info.hb || env.data.settings.can_see_hellbanned)) {
      section.cache = section.cache_hb;
    }
    delete section.cache_hb;

    env.res.section = section;
  });


  // Fill response except section
  //
  N.wire.after(apiPath, function fill_response(env) {
    // Fill topics
    env.res.topics = env.data.topics_out;

    // Fill settings
    env.res.settings = env.data.settings;

    // Fill bookmarks
    env.res.own_bookmarks = _.pluck(env.data.own_bookmarks, 'post_id');
  });
};
