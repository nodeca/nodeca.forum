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
    if (env.user_info.is_guest) throw N.io.FORBIDDEN;
  });


  // Fetch post
  //
  N.wire.before(apiPath, function* fetch_post(env) {
    env.data.post = yield N.models.forum.Post
                              .findOne({ _id: env.params.post_id })
                              .lean(true);
    if (!env.data.post) throw N.io.NOT_FOUND;
  });


  // Fetch topic
  //
  N.wire.before(apiPath, function* fetch_topic(env) {
    env.data.topic = yield N.models.forum.Topic
                              .findOne({ _id: env.data.post.topic })
                              .lean(true);
    if (!env.data.topic) throw N.io.NOT_FOUND;
  });


  // Check if user can see this post
  //
  N.wire.before(apiPath, function* check_access(env) {
    var access_env = { params: { topic: env.data.topic, posts: env.data.post, user_info: env.user_info } };

    yield N.wire.emit('internal:forum.access.post', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Add/remove bookmark
  //
  N.wire.on(apiPath, function* bookmark_add_remove(env) {

    // If `env.params.remove` - remove bookmark
    if (env.params.remove) {
      yield N.models.forum.PostBookmark.remove(
        { user: env.user_info.user_id, post_id: env.params.post_id });

      return;
    }

    // Add bookmark
    let data = { user: env.user_info.user_id, post_id: env.params.post_id };

    // Use `findOneAndUpdate` with `upsert` to avoid duplicates in case of multi click
    yield N.models.forum.PostBookmark.findOneAndUpdate(data, data, { upsert: true });
  });


  // Update post, fill count
  //
  N.wire.after(apiPath, function* update_post(env) {
    let count = yield N.models.forum.PostBookmark.count({ post_id: env.params.post_id });

    env.res.count = count;

    yield N.models.forum.Post.update({ _id: env.params.post_id }, { bookmarks: count });
  });
};
