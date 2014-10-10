// Get post src html, update post
'use strict';

var _ = require('lodash');

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id: { type: 'string', required: true }
  });


  // Fetch post
  //
  N.wire.before(apiPath, function fetch_post(env, callback) {
    N.models.forum.Post.findOne({ _id: env.params.post_id }).lean(true).exec(function (err, post) {
      if (err) {
        callback(err);
        return;
      }

      // TODO: check post status and permissions
      if (!post) {
        callback(N.io.NOT_FOUND);
        return;
      }

      env.data.post = post;
      callback();
    });
  });


  // Check permissions
  //
  N.wire.before(apiPath, function check_permissions(env) {
    // TODO: check post ts (user can edit only posts not older than 30 minutes)
    if (!env.session.user_id || env.session.user_id.toString() !== env.data.post.user.toString()) {
      return N.io.FORBIDDEN;
    }

    // TODO: check moderator permissions to edit post
  });


  // Fill post data
  //
  N.wire.on(apiPath, function fill_data(env) {
    env.res.md = env.data.post.md;
    env.res.attach_tail = _.map(env.data.post.attach_tail, function (attach) {
      return attach.id;
    });
  });
};
