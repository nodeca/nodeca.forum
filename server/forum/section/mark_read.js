// Mark all topics in section as read
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    // section hid
    hid: { type: 'integer', required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_auth(env) {
    if (env.user_info.is_guest) {
      return N.io.FORBIDDEN;
    }
  });


  // Fetch section
  //
  N.wire.before(apiPath, function fetch_section(env, callback) {
    N.models.forum.Section.findOne({ hid: env.params.hid }).lean(true).exec(function (err, section) {
      if (err) {
        callback(err);
        return;
      }

      if (!section) {
        callback(N.io.NOT_FOUND);
        return;
      }

      env.data.section = section;
      callback();
    });
  });


  // Subcall forum.access.section
  //
  N.wire.before(apiPath, function* subcall_section(env) {
    let access_env = { params: { sections: env.data.section, user_info: env.user_info } };

    yield N.wire.emit('internal:forum.access.section', access_env);

    if (!access_env.data.access_read) {
      throw N.io.NOT_FOUND;
    }
  });


  // Mark topics as read
  //
  N.wire.on(apiPath, function* mark_topics_read(env) {
    yield N.models.users.Marker.markAll(env.user_info.user_id, env.data.section._id);
  });
};
