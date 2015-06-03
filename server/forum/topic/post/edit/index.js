// Get post src html, update post
'use strict';

var async = require('async');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id: { format: 'mongo', required: true },
    as_moderator: { type: 'boolean', required: true }
  });


  // Fetch post
  //
  N.wire.before(apiPath, function fetch_post(env, callback) {
    var statuses = N.models.forum.Post.statuses;

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

        if (post.st !== statuses.VISIBLE && post.st !== statuses.HB) {
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
    var Topic = N.models.forum.Topic;

    N.models.forum.Topic.findOne({ _id: env.data.post.topic })
      .lean(true).exec(function (err, topic) {
        if (err) {
          callback(err);
          return;
        }

        var setting_names = [
          'can_see_hellbanned',
          'forum_mod_can_delete_topics',
          'forum_mod_can_see_hard_deleted_topics'
        ];

        env.extras.settings.params.section_id = topic.section;

        env.extras.settings.fetch(setting_names, function (err, settings) {
          if (err) {
            callback(err);
            return;
          }

          // Topic permissions
          var topicVisibleSt = Topic.statuses.LIST_VISIBLE.slice(0);

          if (env.user_info.hb || settings.can_see_hellbanned) {
            topicVisibleSt.push(Topic.statuses.HB);
          }

          if (settings.forum_mod_can_delete_topics) {
            topicVisibleSt.push(Topic.statuses.DELETED);
          }

          if (settings.forum_mod_can_see_hard_deleted_topics) {
            topicVisibleSt.push(Topic.statuses.DELETED_HARD);
          }

          if (topicVisibleSt.indexOf(topic.st) === -1) {
            callback(N.io.NOT_FOUND);
            return;
          }

          env.data.topic = topic;
          callback();
        });
      });
  });


  // Check permissions
  //
  N.wire.before(apiPath, function check_permissions(env, callback) {

    env.extras.settings.params.section_id = env.data.topic.section;

    env.extras.settings.fetch('forum_mod_can_edit_posts', function (err, forum_mod_can_edit_posts) {

      if (err) {
        callback(err);
        return;
      }

      if (forum_mod_can_edit_posts && env.params.as_moderator) {
        callback();
        return;
      }

      if (!env.user_info.user_id || String(env.user_info.user_id) !== String(env.data.post.user)) {
        callback(N.io.FORBIDDEN);
        return;
      }

      env.extras.settings.fetch('forum_edit_max_time', function (err, forum_edit_max_time) {

        if (err) {
          callback(err);
          return;
        }

        if (forum_edit_max_time !== 0 && env.data.post.ts < Date.now() - forum_edit_max_time * 60 * 1000) {
          callback({
            code: N.io.CLIENT_ERROR,
            message: env.t('@forum.topic.post.edit.err_perm_expired')
          });
          return;
        }

        callback();
      });
    });
  });


  N.wire.before(apiPath, function fetch_attachments(env, callback) {
    env.data.attachments = [];

    async.each(env.data.post.attach, function (mediaId, next) {
      N.models.users.MediaInfo
          .findOne({ media_id: mediaId })
          .select('media_id file_name type')
          .lean(true)
          .exec(function (err, result) {

        if (err) {
          next(err);
          return;
        }

        env.data.attachments.push(result);
        next();
      });
    }, callback);
  });


  // Fill post data
  //
  N.wire.on(apiPath, function fill_data(env) {
    env.data.users = env.data.users || [];
    env.data.users.push(env.data.post.user);

    env.res.user_id = env.data.post.user;
    env.res.md = env.data.post.md;
    env.res.attachments = env.data.attachments;
    env.res.params = env.data.post.params;
  });
};
