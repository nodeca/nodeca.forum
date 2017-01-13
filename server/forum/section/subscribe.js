// Subscribe section
//
'use strict';


var _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid: { type: 'integer', required: true },
    type:        { type: 'integer', required: true }
  });


  // Check type
  //
  N.wire.before(apiPath, function check_type(env) {
    if (_.values(N.models.users.Subscription.types).indexOf(env.params.type) === -1) {
      throw N.io.BAD_REQUEST;
    }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_auth(env) {
    if (env.user_info.is_guest) throw N.io.FORBIDDEN;
  });


  // Fetch section
  //
  N.wire.before(apiPath, function* fetch_section(env) {
    env.data.section = yield N.models.forum.Section
                                .findOne({ hid: env.params.section_hid })
                                .lean(true);

    if (!env.data.section) throw N.io.NOT_FOUND;
  });


  // Subcall forum.access.section
  //
  N.wire.before(apiPath, function* subcall_section(env) {
    var access_env = { params: { sections: env.data.section, user_info: env.user_info } };

    yield N.wire.emit('internal:forum.access.section', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Add/remove subscription
  //
  N.wire.on(apiPath, function* subscription_add_remove(env) {
    // Use `update` with `upsert` to avoid duplicates in case of multi click
    yield N.models.users.Subscription.update(
      { user: env.user_info.user_id, to: env.data.section._id },
      { type: env.params.type, to_type: N.shared.content_type.FORUM_SECTION },
      { upsert: true });
  });
};
