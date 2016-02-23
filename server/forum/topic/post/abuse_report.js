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


  // Check if user can see this post
  //
  N.wire.before(apiPath, function* check_access(env) {
    let access_env = { params: { topic: env.data.post.topic, posts: env.data.post, user_info: env.user_info } };

    yield N.wire.emit('internal:forum.access.post', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Send abuse report
  //
  N.wire.on(apiPath, function* send_report_subcall(env) {
    env.data.message = env.params.message;

    let report = new N.models.core.AbuseReport({
      src_id: env.data.post._id,
      type: 'FORUM_POST',
      text: env.params.message,
      from: env.user_info.user_id
    });

    yield N.wire.emit('internal:common.abuse_report', { report });
  });
};
