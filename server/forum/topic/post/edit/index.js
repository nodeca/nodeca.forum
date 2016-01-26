// Get post src html, update post
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id: { format: 'mongo', required: true },
    as_moderator: { type: 'boolean', required: true }
  });


  // Fetch post
  //
  N.wire.before(apiPath, function* fetch_post(env) {
    let post = yield N.models.forum.Post.findOne({ _id: env.params.post_id }).lean(true);

    if (!post) {
      throw N.io.NOT_FOUND;
    }

    env.data.post = post;
  });


  // Fetch post params
  //
  N.wire.before(apiPath, function* fetch_post_params(env) {
    env.data.post_params = yield N.models.core.MessageParams.getParams(env.data.post.params_ref);
  });


  // Fetch topic
  //
  N.wire.before(apiPath, function* fetch_topic(env) {
    let topic = yield N.models.forum.Topic.findOne({ _id: env.data.post.topic }).lean(true);

    if (!topic) {
      throw N.io.NOT_FOUND;
    }

    env.data.topic = topic;
  });


  // Check if user can see this post
  //
  N.wire.before(apiPath, function* check_access(env) {
    let access_env = { params: { topic: env.data.topic, posts: env.data.post, user_info: env.user_info } };

    yield N.wire.emit('internal:forum.access.post', access_env);

    if (!access_env.data.access_read) {
      throw N.io.NOT_FOUND;
    }
  });


  // Check permissions
  //
  N.wire.before(apiPath, function* check_permissions(env) {
    env.extras.settings.params.section_id = env.data.topic.section;

    let forum_mod_can_edit_posts = yield env.extras.settings.fetch('forum_mod_can_edit_posts');

    if (forum_mod_can_edit_posts && env.params.as_moderator) {
      return;
    }

    if (!env.user_info.user_id || String(env.user_info.user_id) !== String(env.data.post.user)) {
      throw N.io.FORBIDDEN;
    }

    let forum_edit_max_time = yield env.extras.settings.fetch('forum_edit_max_time');

    if (forum_edit_max_time !== 0 && env.data.post.ts < Date.now() - forum_edit_max_time * 60 * 1000) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('@forum.topic.post.edit.err_perm_expired')
      };
    }
  });


  N.wire.before(apiPath, function* fetch_attachments(env) {
    env.data.attachments = [];

    yield env.data.post.attach.map(
      mediaId => N.models.users.MediaInfo
                    .findOne({ media_id: mediaId })
                    .select('media_id file_name type')
                    .lean(true)
                    .then(result => env.data.attachments.push(result)));
  });


  // Fill post data
  //
  N.wire.on(apiPath, function fill_data(env) {
    env.data.users = env.data.users || [];
    env.data.users.push(env.data.post.user);

    if (env.data.post.to_user) {
      env.data.users.push(env.data.post.to_user);
    }
    if (env.data.post.del_by) {
      env.data.users.push(env.data.post.del_by);
    }
    if (env.data.post.import_users) {
      env.data.users = env.data.users.concat(env.data.post.import_users);
    }

    env.res.user_id = env.data.post.user;
    env.res.md = env.data.post.md;
    env.res.attachments = env.data.attachments;
    env.res.params = env.data.post_params;
  });
};
