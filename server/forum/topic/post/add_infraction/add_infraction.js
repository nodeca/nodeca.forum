// Add infraction to user
//
'use strict';


const userInfo = require('nodeca.users/lib/user_info');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id:     { format: 'mongo', required: true },
    type:        { type: 'string', required: true },
    expire:      { type: 'integer', required: true },
    points:      { type: 'integer', required: true },
    reason:      { type: 'string' }
  });


  // Validate type
  //
  N.wire.before(apiPath, function validate_type(env) {
    if (env.params.type === 'custom') {
      if (!env.params.reason) throw N.io.BAD_REQUEST;
    } else if (!N.config.users.infractions.types[env.params.type]) throw N.io.BAD_REQUEST;
  });


  // Check is member
  //
  N.wire.before(apiPath, function check_is_member(env) {
    if (env.user_info.is_guest) throw N.io.NOT_FOUND;
  });


  // Fetch post
  //
  N.wire.before(apiPath, function* fetch_post(env) {
    env.data.post = yield N.models.forum.Post.findOne()
                              .where('_id').equals(env.params.post_id)
                              .lean(true);

    if (!env.data.post) throw N.io.NOT_FOUND;
  });


  // Fetch topic
  //
  N.wire.before(apiPath, function* fetch_topic(env) {
    env.data.topic = yield N.models.forum.Topic.findOne()
                              .where('_id').equals(env.data.post.topic)
                              .lean(true);

    if (!env.data.topic) throw N.io.NOT_FOUND;
  });


  // Check permissions
  //
  N.wire.before(apiPath, function* check_permissions(env) {
    env.extras.settings.params.section_id = env.data.topic.section;

    let forum_mod_can_add_infractions = yield env.extras.settings.fetch('forum_mod_can_add_infractions');

    if (!forum_mod_can_add_infractions) throw N.io.FORBIDDEN;

    let user_info = yield userInfo(N, env.data.post.user);
    let params = {
      user_id: user_info.user_id,
      usergroup_ids: user_info.usergroups
    };
    let cannot_receive_infractions = yield N.settings.get('cannot_receive_infractions', params, {});

    if (cannot_receive_infractions) throw { code: N.io.CLIENT_ERROR, message: env.t('err_perm_receive') };
  });


  // Check infraction already exists
  //
  N.wire.before(apiPath, function* check_exists(env) {
    let infraction = yield N.models.users.Infraction.findOne()
                              .where('src').equals(env.data.post._id)
                              .where('exists').equals(true)
                              .lean(true);

    if (infraction) throw { code: N.io.CLIENT_ERROR, message: env.t('err_infraction_exists') };
  });


  // Save infraction
  //
  N.wire.on(apiPath, function* add_infraction(env) {
    let infraction = new N.models.users.Infraction({
      from: env.user_info.user_id,
      'for': env.data.post.user,
      type: env.params.type,
      reason: env.params.reason,
      points: env.params.points,
      src: env.data.post._id,
      src_type: 'FORUM_POST'
    });

    if (env.params.expire > 0) {
      // Expire in days
      infraction.expire = new Date(Date.now() + (env.params.expire * 24 * 60 * 60 * 1000));
    }

    yield infraction.save();
  });
};
