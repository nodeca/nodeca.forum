// Vote post
'use strict';

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id: { format: 'mongo', required: true },
    value:   { type: 'integer', required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_auth(env) {
    if (env.user_info.is_guest) {
      return N.io.FORBIDDEN;
    }
  });


  // Check that post exists, visible and not bolongs to current user
  //
  N.wire.before(apiPath, function fetch_post(env, callback) {
    var statuses = N.models.forum.Post.statuses;

    N.models.forum.Post.findOne({ _id: env.params.post_id })
        .lean(true)
        .exec(function (err, post) {

      if (err) {
        callback(err);
        return;
      }

      if (!post) {
        callback(N.io.NOT_FOUND);
        return;
      }

      if (post.user.equals(env.user_info.user_id)) {
        // hardcode msg, because that should never happen
        callback({
          code: N.io.CLIENT_ERROR,
          message: "Can't vote own post"
        });
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
    N.models.forum.Topic.findOne({ _id: env.data.post.topic })
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


  // Check permissions
  //
  N.wire.before(apiPath, function check_permissions(env, callback) {
    var post = env.data.post;

    env.extras.settings.params.section_id = env.data.topic.section;

    env.extras.settings.fetch([ 'forum_can_view', 'can_vote', 'votes_add_max_time' ], function (err, settings) {
      if (err) {
        callback(err);
        return;
      }

      if (!settings.forum_can_view) {
        callback(N.io.NOT_FOUND);
        return;
      }

      if (!settings.can_vote) {
        callback(N.io.FORBIDDEN);
        return;
      }

      if (settings.votes_add_max_time !== 0 && post.ts < Date.now() - settings.votes_add_max_time * 60 * 60 * 1000) {
        callback({
          code: N.io.CLIENT_ERROR,
          message: env.t('err_perm_expired')
        });
        return;
      }

      callback();
    });
  });


  // Remove previous vote if exists
  //
  N.wire.before(apiPath, function remove_votes(env, callback) {
    N.models.users.Vote.remove(
      { for: env.params.post_id, from: env.user_info.user_id },
      callback
    );
  });


  // Add vote
  //
  N.wire.on(apiPath, function add_vote(env, callback) {
    if (env.params.value === 0) {
      callback();
      return;
    }

    var data = {
      for: env.params.post_id,
      from: env.user_info.user_id,
      to: env.data.post.user,
      type: N.models.users.Vote.types.FORUM_POST,
      value: env.params.value === 1 ? 1 : -1,
      hb: env.user_info.hb
    };

    N.models.users.Vote.findOneAndUpdate(
      { for: env.params.post_id, from: env.user_info.user_id },
      data,
      { upsert: true },
      callback
    );
  });


  // Update post
  //
  N.wire.after(apiPath, function update_post(env, callback) {
    N.models.users.Vote.aggregate([
      { $match: { for: env.data.post._id } },
      {
        $group: {
          _id: null,
          votes: { $sum: { $cond: { if: '$hb', then: 0, else: '$value' } } },
          votes_hb: { $sum: '$value' }
        }
      },
      {
        $project: {
          _id: false,
          votes: true,
          votes_hb: true
        }
      }
    ], function (err, result) {

      if (err) {
        callback(err);
        return;
      }

      N.models.forum.Post.update({ _id: env.data.post._id }, result[0] || { votes: 0, votes_hb: 0 }, callback);
    });
  });
};
