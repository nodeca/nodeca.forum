// Remove post by id
'use strict';

// topic and post statuses
var statuses   = require('../_lib/statuses.js');

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id: { type: 'string', required: true },
    moderator_action: { type: 'boolean', required: true }
  });


  // Fetch post
  //
  N.wire.before(apiPath, function fetch_post(env, callback) {
    N.models.forum.Post.findOne({ _id: env.params.post_id })
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


  // Fetch topic
  //
  N.wire.before(apiPath, function fetch_topic(env, callback) {
    N.models.forum.Topic.findOne({ _id: env.data.post.topic })
      .lean(true).exec(function (err, topic) {
        if (err) {
          callback(err);
          return;
        }

        env.data.topic = topic;
        callback();
      });
  });


  // Check permissions
  //
  N.wire.before(apiPath, function check_permissions(env, callback) {

    env.extras.settings.params.section_id = env.data.topic.section;

    env.extras.settings.fetch('forum_mod_can_delete_posts', function (err, forum_mod_can_delete_posts) {

      if (err) {
        callback(err);
        return;
      }

      if (forum_mod_can_delete_posts) {
        callback();
        return;
      }

      if (!env.session.user_id || env.session.user_id.toString() !== env.data.post.user.toString()) {
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

        // TODO: check is last post
        callback();
      });
    });
  });


  // Remove post
  //
  N.wire.on(apiPath, function delete_post(env, callback) {
    // TODO: check is topic empty

    N.models.forum.Post.remove({ _id: env.data.post._id }, function (err) {

      if (err) {
        callback(err);
        return;
      }

      callback();
    });
  });

  // TODO: log moderator actions
};
