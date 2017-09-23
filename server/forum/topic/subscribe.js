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
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // Fetch topic
  //
  N.wire.before(apiPath, async function fetch_topic(env) {
    env.data.topic = await N.models.forum.Topic
                              .findOne({ hid: env.params.topic_hid })
                              .lean(true);

    if (!env.data.topic) throw N.io.NOT_FOUND;
  });

  // Subcall forum.access.topic
  //
  N.wire.before(apiPath, async function subcall_topic(env) {
    var access_env = { params: { topics: env.data.topic, user_info: env.user_info } };

    await N.wire.emit('internal:forum.access.topic', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Add/remove subscription
  //
  N.wire.on(apiPath, async function subscription_add_remove(env) {
    // Use `update` with `upsert` to avoid duplicates in case of multi click
    await N.models.users.Subscription.update(
      { user: env.user_info.user_id, to: env.data.topic._id },
      {
        type: env.params.type,
        to_type: N.shared.content_type.FORUM_TOPIC
      },
      { upsert: true });
  });
};
