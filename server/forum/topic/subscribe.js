// Subscribe topic
//
'use strict';


var _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid: { type: 'integer', required: true },
    type:      { type: 'integer', required: true }
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


  // Subcall forum.access.topic
  //
  N.wire.before(apiPath, function subcall_topic(env, callback) {
    var data = { env: env, params: { topic_hid: env.params.topic_hid } };

    N.wire.emit('internal:forum.access.topic', data, function (err) {
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


  // Add/remove subscription
  //
  N.wire.on(apiPath, function subscription_add_remove(env, callback) {
    var data = {
      user_id: env.user_info.user_id,
      to: env.data.topic._id
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
