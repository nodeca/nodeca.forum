// Get post src html, update post
'use strict';

// topic and post statuses
var statuses   = require('../../_lib/statuses.js');

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id: { type: 'string', required: true }
  });


  // Fetch post
  //
  N.wire.before(apiPath, function fetch_post(env, callback) {
    N.models.forum.Post.findOne({ _id: env.params.post_id, user: env.session.user_id })
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

      // TODO: check moderator permissions to edit post
      callback();
    });
  });


  // Fill post data
  //
  N.wire.on(apiPath, function fill_data(env) {
    env.res.md = env.data.post.md;
    env.res.attach_tail = env.data.post.attach_tail;
    env.res.params = env.data.post.params;
  });
};
