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



  // Check topic permissions
  //
  N.wire.before(apiPath, function check_topic_permissions(env, callback) {
    var topic = env.data.topic;
    var topic_st = N.models.forum.Topic.statuses;
    var topic_visible_st = [ topic_st.OPEN, topic_st.CLOSED ];

    env.extras.settings.params.section_id = topic.section;

    env.extras.settings.fetch([ 'forum_can_view', 'can_see_hellbanned' ], function (err, settings) {
      if (err) {
        callback(err);
        return;
      }

      // Check topic status
      if (topic_visible_st.indexOf(topic.st) === -1 && topic_visible_st.indexOf(topic.ste) === -1) {
        callback(N.io.NOT_FOUND);
        return;
      }

      // Check hellbanned
      if (!env.user_info.hb && !settings.can_see_hellbanned && topic.st === topic_st.HB) {
        callback(N.io.NOT_FOUND);
        return;
      }

      if (!settings.forum_can_view) {
        callback(N.io.NOT_FOUND);
        return;
      }

      callback();
    });
  });


  // Check post permissions
  //
  N.wire.before(apiPath, function check_post_permissions(env, callback) {
    var post = env.data.post;
    var post_st = N.models.forum.Post.statuses;
    var post_visible_st = [ post_st.VISIBLE ];

    env.extras.settings.fetch([ 'can_see_hellbanned' ], function (err, settings) {
      if (err) {
        callback(err);
        return;
      }

      // Check post status
      if (post_visible_st.indexOf(post.st) === -1 && post_visible_st.indexOf(post.ste) === -1) {
        callback(N.io.NOT_FOUND);
        return;
      }

      // Check hellbanned
      if (!env.user_info.hb && !settings.can_see_hellbanned && post.st === post_st.HB) {
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
