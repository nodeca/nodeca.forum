// Mark all topics in section as read
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    // section hid
    hid: { type: 'integer', required: true }
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
  N.wire.before(apiPath, function subcall_section(env, callback) {
    var access_env = { params: { sections: env.data.section, user_info: env.user_info } };

    N.wire.emit('internal:forum.access.section', access_env, function (err) {
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


  // Mark topics as read
  //
  N.wire.on(apiPath, function mark_topics_read(env, callback) {
    N.models.core.Marker.markAll(env.user_info.user_id, env.data.section._id, callback);
  });
};
