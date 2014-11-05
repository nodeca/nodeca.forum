// Remove post by id
'use strict';

// topic and post statuses
var statuses   = require('nodeca.forum/server/forum/_lib/statuses.js');

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


  // Remove post or topic
  //
  N.wire.on(apiPath, function delete_post(env, callback) {
    var topic = env.data.topic;
    var post = env.data.post;

    // Check delete first post
    if (topic.cache_hb.first_post.equals(post._id) || topic.cache.first_post.equals(post._id)) {

      env.data.is_topic = env.res.is_topic = true;

      // TODO: statuses history
      N.models.forum.Topic.update(
        { _id: topic._id },
        { st: statuses.topic.DELETED },
        callback
      );
      return;
    }

    env.data.is_topic = env.res.is_topic = false;

    // TODO: statuses history
    N.models.forum.Post.update(
      { _id: post._id },
      { st: statuses.post.DELETED },
      callback
    );
  });


  // Update topic counters
  //
  N.wire.after(apiPath, function update_topic(env, callback) {

    // If whole topic deleted don't update cache
    if (env.data.is_topic) {
      callback();
      return;
    }

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
