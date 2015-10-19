// Add/remove bookmark
'use strict';

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id: { format: 'mongo', required: true },
    remove:  { type: 'boolean', required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_auth(env) {
    if (env.user_info.is_guest) {
      return N.io.FORBIDDEN;
    }
  });


  // Fetch post
  //
  N.wire.before(apiPath, function fetch_post(env, callback) {
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


  // Check if user can see this post
  //
  N.wire.before(apiPath, function check_access(env, callback) {
    var access_env = { params: { topic: env.data.topic, posts: env.data.post, user_info: env.user_info } };

    N.wire.emit('internal:forum.access.post', access_env, function (err) {
      if (err) {
        callback(err);
        return;
      }

      if (!access_env.data.access_read) {
        callback(N.io.NOT_FOUND);
        return;
      }

      callback();
    });
  });


  // Add/remove bookmark
  //
  N.wire.on(apiPath, function bookmark_add_remove(env, callback) {

    // If `env.params.remove` - remove bookmark
    if (env.params.remove) {
      N.models.forum.PostBookmark.remove(
        { user_id: env.user_info.user_id, post_id: env.params.post_id },
        function (err) {

          if (err) {
            callback(err);
            return;
          }

          callback();
        }
      );

      return;
    }

    // Add bookmark
    var data = { user_id: env.user_info.user_id, post_id: env.params.post_id };

    // Use `findOneAndUpdate` with `upsert` to avoid duplicates in case of multi click
    N.models.forum.PostBookmark.findOneAndUpdate(data, data, { upsert: true }, function (err) {
      if (err) {
        callback(err);
        return;
      }

      callback();
    });
  });


  // Update post, fill count
  //
  N.wire.after(apiPath, function update_post(env, callback) {
    N.models.forum.PostBookmark.count({ post_id: env.params.post_id }, function (err, count) {
      if (err) {
        callback(err);
        return;
      }

      env.res.count = count;

      N.models.forum.Post.update({ _id: env.params.post_id }, { bookmarks: count }, callback);
    });
  });
};
