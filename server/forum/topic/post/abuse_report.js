// Send abuse report
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id: { format: 'mongo', required: true },
    message: { type: 'string', required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // Check permissions
  //
  N.wire.before(apiPath, function* check_permissions(env) {
    let can_report_abuse = yield env.extras.settings.fetch('can_report_abuse');

    if (!can_report_abuse) throw N.io.FORBIDDEN;
  });


  // Fetch post
  //
  N.wire.before(apiPath, function* fetch_post(env) {
    env.data.post = yield N.models.forum.Post
      .findOne({ _id: env.params.post_id })
      .lean(true);

    if (!env.data.post) throw N.io.NOT_FOUND;
  });


  // Check if user can see this post
  //
  N.wire.before(apiPath, function* check_access(env) {
    let access_env = { params: {
      posts: env.data.post,
      user_info: env.user_info,
      preload: [ env.data.topic ]
    } };

    yield N.wire.emit('internal:forum.access.post', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Send abuse report
  //
  N.wire.on(apiPath, function* send_report_subcall(env) {
    env.data.message = env.params.message;

    let params = yield N.models.core.MessageParams.getParams(env.data.post.params_ref);

    // enable markup used in templates (even if it's disabled in forum)
    params.link  = true;
    params.quote = true;

    let report = new N.models.core.AbuseReport({
      src: env.data.post._id,
      type: N.shared.content_type.FORUM_POST,
      text: env.params.message,
      from: env.user_info.user_id,
      params_ref: yield N.models.core.MessageParams.setParams(params)
    });

    yield N.wire.emit('internal:common.abuse_report', { report });
  });


  // Mark user as active
  //
  N.wire.after(apiPath, function* set_active_flag(env) {
    yield N.wire.emit('internal:users.mark_user_active', env);
  });
};
