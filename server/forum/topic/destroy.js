// Remove topic by hid
'use strict';

// topic and post statuses
var statuses   = require('nodeca.forum/server/forum/_lib/statuses.js');

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid: { type: 'integer', minimum: 1, required: true },
    moderator_action: { type: 'boolean', required: true }
  });


  // Fetch topic
  //
  N.wire.before(apiPath, function fetch_topic(env, callback) {
    N.models.forum.Topic.findOne({ hid: env.params.topic_hid })
      .lean(true).exec(function (err, topic) {
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


  // Fetch first post
  //
  N.wire.before(apiPath, function fetch_post(env, callback) {
    N.models.forum.Post.findOne({ _id: env.data.topic.cache.first_post })
      .lean(true).exec(function (err, post) {
        if (err) {
          callback(err);
          return;
        }

        if (!post) {
          callback(N.io.NOT_FOUND);
          return;
        }

        if (post.st !== statuses.post.VISIBLE && post.st !== statuses.post.HB) {
          callback(N.io.NOT_FOUND);
          return;
        }

        env.data.post = post;
        callback();
      });
  });


  // Check permissions
  //
  N.wire.before(apiPath, function check_permissions(env, callback) {
    var topic = env.data.topic;

    env.extras.settings.params.section_id = env.data.topic.section;

    env.extras.settings.fetch(
      [ 'forum_mod_can_delete_posts', 'forum_mod_can_delete_topics' ],
      function (err, permissions) {

        if (err) {
          callback(err);
          return;
        }

        // Check can moderator delete topic if in topic only one post
        if (permissions.forum_mod_can_delete_posts && topic.cache.post_count === 1 && topic.cache_hb.post_count === 1) {
          callback();
          return;
        }

        // Check can moderator delete topic with multiple posts
        if (permissions.forum_mod_can_delete_topics) {
          callback();
          return;
        }

        // Check owner of first post in topic
        if (!env.session.user_id || env.session.user_id.toString() !== env.data.post.user.toString()) {
          callback(N.io.FORBIDDEN);
          return;
        }

        // User can't delete topic with answers
        if (topic.cache.post_count !== 1 || topic.cache_hb.post_count !== 1) {
          callback(N.io.FORBIDDEN);
          return;
        }

        env.extras.settings.fetch('forum_edit_max_time', function (err, forum_edit_max_time) {

          if (err) {
            callback(err);
            return;
          }

          if (forum_edit_max_time !== 0 && env.data.post.ts < Date.now() - forum_edit_max_time * 60 * 1000) {
            callback(N.io.FORBIDDEN);
            return;
          }

          callback();
        });
      }
    );
  });


  // Remove topic
  //
  N.wire.on(apiPath, function delete_topic(env, callback) {
    var topic = env.data.topic;

    // TODO: statuses history
    N.models.forum.Topic.update(
      { _id: topic._id },
      { st: statuses.topic.DELETED, $unset: { ste: 1 } },
      callback
    );
  });

  // TODO: log moderator actions
};
