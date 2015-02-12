// Get posts list with all data needed to render
//
// in:
//
// - env.data.topic_hid
// - env.data.build_posts_ids (env, callback) - should fill `env.data.posts_ids`
//
// out:
//
//   env:
//     res:
//       settings: { hid: ... }
//       topic: ...    # sanitized, with restricted fields
//       posts: ...    # array, sanitized, with restricted fields
//       section: ...  # with restricted fields
//     data:
//       posts_visible_statuses: ...
//       settings: ...
//       topic: ...
//       posts: ...
//       section: ...
//

'use strict';

var _ = require('lodash');

var fields = require('./_post_list_fields.js');

module.exports = function (N, apiPath) {

  // Shortcuts
  var Section = N.models.forum.Section;
  var Topic   = N.models.forum.Topic;
  var Post    = N.models.forum.Post;


  // Fetch topic
  //
  N.wire.before(apiPath, function fetch_topic(env, callback) {
    Topic.findOne({ hid: env.data.topic_hid })
        .lean(true)
        .exec(function (err, topic) {

      if (err) {
        callback(err);
        return;
      }

      if (!topic) {
        callback(N.io.NOT_FOUND);
        return;
      }

      env.data.topic = topic;
      callback();
    });
  });


  // Fetch section
  //
  N.wire.before(apiPath, function fetch_section(env, callback) {
    Section.findOne({ _id: env.data.topic.section })
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


  // Check access permissions
  //
  N.wire.before(apiPath, function check_access_permissions(env, callback) {
    // Section permission
    if (!env.data.settings.forum_can_view) {
      callback(N.io.FORBIDDEN);
      return;
    }

    // Topic permissions
    var topicVisibleSt = [
      Topic.statuses.OPEN,
      Topic.statuses.CLOSED,
      Topic.statuses.PINNED
    ];

    if (env.user_info.hb || env.data.settings.can_see_hellbanned) {
      topicVisibleSt.push(Topic.statuses.HB);
    }

    if (env.data.settings.forum_mod_can_delete_topics) {
      topicVisibleSt.push(Topic.statuses.DELETED);
    }

    if (env.data.settings.forum_mod_can_see_hard_deleted_topics) {
      topicVisibleSt.push(Topic.statuses.DELETED_HARD);
    }

    if (topicVisibleSt.indexOf(env.data.topic.st) === -1) {
      callback(N.io.NOT_FOUND);
      return;
    }

    callback();
  });


  // Define visible post statuses
  //
  N.wire.before(apiPath, function define_visible_post_st(env) {
    var postVisibleSt = [ Post.statuses.VISIBLE ];

    if (env.data.settings.can_see_hellbanned || env.user_info.hb) {
      postVisibleSt.push(Post.statuses.HB);
    }

    if (env.data.settings.forum_mod_can_delete_topics) {
      postVisibleSt.push(Post.statuses.DELETED);
    }

    if (env.data.settings.forum_mod_can_see_hard_deleted_topics) {
      postVisibleSt.push(Post.statuses.DELETED_HARD);
    }

    env.data.posts_visible_statuses = postVisibleSt;
  });


  // Get posts ids
  //
  N.wire.before(apiPath, function get_posts_ids(env, callback) {
    env.data.build_posts_ids(env, callback);
  });


  // Fetch posts
  //
  N.wire.on(apiPath, function fetch_posts(env, callback) {
    Post.find()
        .where('_id').in(env.data.posts_ids)
        .where('st').in(env.data.posts_visible_statuses)
        .where('topic').equals(env.data.topic._id)
        .lean(true)
        .exec(function (err, posts) {

      if (err) {
        callback(err);
        return;
      }

      env.data.posts = posts;
      callback();
    });
  });


  // Collect users
  //
  N.wire.after(apiPath, function process_posts(env) {
    env.data.users = env.data.users || [];

    env.data.posts.forEach(function (post) {
      if (post.user) {
        env.data.users.push(post.user);
      }
      if (post.del_by) {
        env.data.users.push(post.del_by);
      }
    });
  });


  // Fill response
  //
  N.wire.after(apiPath, function fill_response(env) {

    // Fill posts
    env.res.posts = [];

    env.data.posts.forEach(function (post) {
      var restrictedPost = _.pick(post, fields.post);

      Post.sanitize(restrictedPost, { keep_statuses: env.data.settings.can_see_hellbanned });
      env.res.posts.push(restrictedPost);
    });

    // Fill topic
    var topic = _.pick(env.data.topic, fields.topic);

    Topic.sanitize(topic, {
      keep_statuses: env.data.settings.can_see_hellbanned,
      keep_data: env.user_info.hb || env.data.settings.can_see_hellbanned
    });

    env.res.topic = topic;

    // Fill section
    env.res.section = _.pick(env.data.section, fields.section);

    // Fill settings
    env.res.settings = env.data.settings;
  });
};
