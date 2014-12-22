// Remove post by id
'use strict';

var _ = require('lodash');

// topic and post statuses
var statuses   = require('nodeca.forum/server/forum/_lib/statuses.js');

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id:      { format: 'mongo', required: true },
    reason:       { type: 'string' },
    method:       { type: 'string', enum: [ 'hard', 'soft' ], required: true },
    as_moderator: { type: 'boolean', required: true }
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

    // We can't delete first port. Topic operation should be requested instead
    if (String(env.data.topic.cache.first_post) === String(env.data.post._id)) {
      callback(N.io.FORBIDDEN);
      return;
    }

    // Check moderator permissions

    if (env.params.as_moderator) {
      env.extras.settings.fetch('forum_mod_can_delete_topics', function (err, forum_mod_can_delete_topics) {
        if (err) {
          callback(err);
          return;
        }

        if (!forum_mod_can_delete_topics) {
          callback(N.io.FORBIDDEN);
          return;
        }

        callback();
      });

      return;
    }

    // Check user permissions

    // User can't hard delete posts
    if (env.params.method === 'hard') {
      callback(N.io.FORBIDDEN);
      return;
    }

    // Check post owner
    if (env.session.user_id !== String(env.data.post.user)) {
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
  });


  // Remove post
  //
  N.wire.on(apiPath, function delete_post(env, callback) {
    var post = env.data.post;
    var update = {
      st: env.params.method === 'hard' ? statuses.post.DELETED_HARD : statuses.post.DELETED,
      $unset: { ste: 1 },
      $push: {
        st_hist: _.pick(post, [ 'st', 'ste' ])
      }
    };

    if (env.params.reason) {
      update.del_reason = env.params.reason;
    }

    N.models.forum.Post.update(
      { _id: post._id },
      update,
      callback
    );
  });


  // Update topic counters
  //
  N.wire.after(apiPath, function update_topic(env, callback) {
    var incData = {};

    if (env.data.post.st === statuses.post.VISIBLE) {
      incData['cache.post_count'] = -1;
      incData['cache.attach_count'] = -env.data.post.attach_refs.length;
    }

    incData['cache_hb.post_count'] = -1;
    incData['cache_hb.attach_count'] = -env.data.post.attach_refs.length;


    N.models.forum.Topic.update(
      { _id: env.data.topic._id },
      { $inc: incData },
      function (err) {

        if (err) {
          callback(err);
          return;
        }

        N.models.forum.Topic.updateCache(env.data.topic._id, true, callback);
      }
    );
  });

  // TODO: log moderator actions
};
