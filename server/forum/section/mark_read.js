// Mark all topics in section as read
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    // section hid
    hid: { type: 'integer', required: true }
  });


  // Subcall forum.access.section
  //
  N.wire.before(apiPath, function subcall_section(env, callback) {
    var data = { env: env, params: env.params };

    N.wire.emit('internal:forum.access.section', data, function (err) {
      if (err) {
        callback(err);
        return;
      }

      if (!env.data.access_read) {
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
