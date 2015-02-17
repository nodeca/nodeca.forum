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


  // Check post exists and visible
  //
  N.wire.before(apiPath, function fetch_post(env, callback) {
    var statuses = N.models.forum.Post.statuses;

    N.models.forum.Post.findOne({ _id: env.params.post_id })
        .select('user topic st ts')
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
        .select('section')
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


  // Check permissions
  //
  N.wire.before(apiPath, function check_permissions(env, callback) {
    var post = env.data.post;

    env.extras.settings.params.section_id = env.data.topic.section;

    env.extras.settings.fetch([ 'can_vote', 'votes_add_max_time' ], function (err, settings) {
      if (err) {
        callback(err);
        return;
      }

      if (!settings.can_vote) {
        callback(N.io.FORBIDDEN);
        return;
      }

      if (settings.votes_add_max_time !== 0 && post.ts < Date.now() - settings.votes_add_max_time * 60 * 60 * 1000) {
        callback(N.io.FORBIDDEN);
        return;
      }

      callback();
    });
  });


  // Fetch vote
  //
  N.wire.before(apiPath, function fetch_vote(env, callback) {
    N.models.users.Vote.findOne({ to: env.params.post_id, from: env.session.user_id })
        .select('value')
        .lean(true)
        .exec(function (err, vote) {

      if (err) {
        callback(err);
        return;
      }

      env.data.vote = vote;
      callback();
    });
  });


  // Add vote or set vote value
  //
  N.wire.on(apiPath, function set_vote(env, callback) {
    var oldValue = env.data.vote ? env.data.vote.value : 0;
    var newValue = env.params.value === 1 ? N.models.users.Vote.values.UP : N.models.users.Vote.values.DOWN;

    // If user click again to same button - reset vote
    if (oldValue === newValue) {
      newValue = N.models.users.Vote.values.NONE;
    }

    env.data.value = { old: oldValue, new: newValue };

    var query = {
      to: env.params.post_id,
      from: env.session.user_id
    };

    var data = {
      to: env.params.post_id,
      from: env.session.user_id,
      for: env.data.post.user,
      type: N.models.users.Vote.types.FORUM_POST,
      value: newValue
    };

    // Use `findOneAndUpdate` with `upsert` to avoid duplicates in case of multi click
    N.models.users.Vote.findOneAndUpdate(query, data, { upsert: true }, function (err) {
      if (err) {
        callback(err);
        return;
      }

      callback();
    });
  });


  // Update post
  //
  N.wire.after(apiPath, function update_post(env, callback) {
    var data = {
      $inc: {
        votes_up: 0,
        votes_down: 0
      }
    };

    if (env.data.value.old === N.models.users.Vote.values.UP) {
      data.$inc.votes_up -= 1;
    } else if (env.data.value.old === N.models.users.Vote.values.DOWN) {
      data.$inc.votes_down -= 1;
    }

    if (env.data.value.new === N.models.users.Vote.values.UP) {
      data.$inc.votes_up += 1;
    } else if (env.data.value.new === N.models.users.Vote.values.DOWN) {
      data.$inc.votes_down += 1;
    }

    if (data.$inc.votes_down === 0 && data.$inc.votes_up === 0) {
      callback();
      return;
    }

    N.models.forum.Post.update({ _id: env.params.post_id }, data, function (err) {
      if (err) {
        callback(err);
        return;
      }

      callback();
    });
  });
};
