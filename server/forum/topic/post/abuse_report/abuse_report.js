// Send abuse report
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    properties: {
      post_id: { format: 'mongo', required: true },
      message: { type: 'string' },
      move_to: { type: 'integer', minimum: 1 }
    },

    additionalProperties: false,

    oneOf: [
      { required: [ 'message' ] },
      { required: [ 'move_to' ] }
    ]
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let can_report_abuse = await env.extras.settings.fetch('can_report_abuse');

    if (!can_report_abuse) throw N.io.FORBIDDEN;
  });


  // Check permissions if user wants to move this topic
  //
  N.wire.before(apiPath, async function subcall_section(env) {
    if (!env.params.move_to) return;

    env.data.move_to_section = await N.models.forum.Section.findOne()
                                         .where('hid').equals(env.params.move_to)
                                         .lean(true);

    if (!env.data.move_to_section) throw N.io.NOT_FOUND;

    let access_env = { params: { sections: env.data.move_to_section, user_info: env.user_info } };

    await N.wire.emit('internal:forum.access.section', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Fetch post
  //
  N.wire.before(apiPath, async function fetch_post(env) {
    env.data.post = await N.models.forum.Post
      .findOne({ _id: env.params.post_id })
      .lean(true);

    if (!env.data.post) throw N.io.NOT_FOUND;
  });


  // Check if user can see this post
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: {
      posts: env.data.post,
      user_info: env.user_info
    } };

    await N.wire.emit('internal:forum.access.post', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Send abuse report
  //
  N.wire.on(apiPath, async function send_report_subcall(env) {
    env.data.message = env.params.message;

    let params = await N.models.core.MessageParams.getParams(env.data.post.params_ref);

    // enable markup used in templates (even if it's disabled in forum)
    params.link  = true;
    params.quote = true;

    let report;

    if (env.data.move_to_section) {
      report = new N.models.core.AbuseReport({
        src: env.data.post._id,
        type: N.shared.content_type.FORUM_POST,
        data: { move_to: env.data.move_to_section._id },
        from: env.user_info.user_id,
        params_ref: await N.models.core.MessageParams.setParams(params)
      });
    } else {
      report = new N.models.core.AbuseReport({
        src: env.data.post._id,
        type: N.shared.content_type.FORUM_POST,
        text: env.params.message,
        from: env.user_info.user_id,
        params_ref: await N.models.core.MessageParams.setParams(params)
      });
    }

    await N.wire.emit('internal:common.abuse_report', { report });
  });


  // Mark user as active
  //
  N.wire.after(apiPath, async function set_active_flag(env) {
    await N.wire.emit('internal:users.mark_user_active', env);
  });
};
