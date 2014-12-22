// Undelete removed post by id
'use strict';

var _ = require('lodash');

// topic and post statuses
var statuses   = require('nodeca.forum/server/forum/_lib/statuses.js');

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id: { format: 'mongo', required: true }
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

    // We can't undelete first port. Topic operation should be requested instead
    if (String(env.data.topic.cache.first_post) === String(env.data.post._id)) {
      callback(N.io.FORBIDDEN);
      return;
    }

    env.extras.settings.fetch(
      [ 'forum_mod_can_delete_topics', 'forum_mod_can_see_hard_deleted_topics' ],
      function (err, settings) {
        if (err) {
          callback(err);
          return;
        }

        if (env.data.post.st === statuses.post.DELETED && settings.forum_mod_can_delete_topics) {
          callback();
          return;
        }

        if (env.data.post.st === statuses.post.DELETED_HARD && settings.forum_mod_can_see_hard_deleted_topics) {
          callback();
          return;
        }

        callback(N.io.FORBIDDEN);
      }
    );
  });


  // Undelete post
  //
  N.wire.on(apiPath, function undelete_post(env, callback) {
    var post = env.data.post;
    var previousSt = post.st_hist[post.st_hist.length - 1];

    var update = {
      $push: {
        st_hist: _.pick(post, [ 'st', 'ste', 'del_reason' ])
      },
      $unset: { del_reason: 1 }
    };

    _.assign(update, previousSt);

    N.models.forum.Post.update(
      { _id: post._id },
      update,
      callback
    );
  });


  // Update topic counters
  //
  N.wire.after(apiPath, function update_topic(env, callback) {
    var previousSt = env.data.post.st_hist[env.data.post.st_hist.length - 1];
    var incData = {};

    if (previousSt.st === statuses.post.VISIBLE) {
      incData['cache.post_count'] = 1;
      incData['cache.attach_count'] = env.data.post.attach_refs.length;
    }

    incData['cache_hb.post_count'] = 1;
    incData['cache_hb.attach_count'] = env.data.post.attach_refs.length;


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
