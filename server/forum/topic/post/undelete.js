// Undelete removed post by id
'use strict';

var _ = require('lodash');

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
    var statuses = N.models.forum.Post.statuses;

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

        if (env.data.post.st === statuses.DELETED && settings.forum_mod_can_delete_topics) {
          callback();
          return;
        }

        if (env.data.post.st === statuses.DELETED_HARD && settings.forum_mod_can_see_hard_deleted_topics) {
          callback();
          return;
        }

        // We should not show, that topic exists if no permissions
        callback(N.io.NOT_FOUND);
      }
    );
  });


  // Undelete post
  //
  N.wire.on(apiPath, function undelete_post(env, callback) {
    var post = env.data.post;

    var update = {
      $unset: { del_reason: 1, prev_st: 1, del_by: 1 }
    };

    _.assign(update, post.prev_st);

    N.models.forum.Post.update(
      { _id: post._id },
      update,
      callback
    );
  });


  // Update topic counters
  //
  N.wire.after(apiPath, function update_topic(env, callback) {
    var statuses = N.models.forum.Post.statuses;
    var incData = {};

    if (env.data.post.prev_st.st === statuses.VISIBLE) {
      incData['cache.post_count'] = 1;
      incData['cache.attach_count'] = env.data.post.attach.length;
    }

    incData['cache_hb.post_count'] = 1;
    incData['cache_hb.attach_count'] = env.data.post.attach.length;


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


  // Restore votes
  //
  N.wire.after(apiPath, function restore_votes(env, callback) {
    N.models.users.Vote.collection.update(
      { for: env.data.post._id },
      // Just move vote `backup` field back to `value` field
      { $rename: { 'backup': 'value' } },
      { multi: true },
      function (err) {
        if (err) {
          callback(err);
          return;
        }

        callback();
      }
    );
  });

  // TODO: log moderator actions
};
