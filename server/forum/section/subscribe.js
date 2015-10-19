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
      return N.io.BAD_REQUEST;
    }
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
    N.models.forum.Section.findOne({ hid: env.params.section_hid }).lean(true).exec(function (err, section) {
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


  // Add/remove subscription
  //
  N.wire.on(apiPath, function subscription_add_remove(env, callback) {
    var data = {
      user_id: env.user_info.user_id,
      to: env.data.section._id
    };

    // Use `findOneAndUpdate` with `upsert` to avoid duplicates in case of multi click
    N.models.users.Subscription.findOneAndUpdate(
      data,
      _.assign({}, data, { type: env.params.type }),
      { upsert: true },
      callback
    );
  });
};
