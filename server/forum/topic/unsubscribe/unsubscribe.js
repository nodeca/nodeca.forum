// Update subscription type and show unsubscribe topic page
//
// `WATCHING|TRACKING -> NORMAL -> MUTED`
//
'use strict';


var sanitize_topic   = require('nodeca.forum/lib/sanitizers/topic');
var sanitize_section = require('nodeca.forum/lib/sanitizers/section');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid: { type: 'integer', required: true },
    topic_hid:   { type: 'integer', required: true }
  });


  // Redirect guests to login page
  //
  N.wire.before(apiPath, function force_login_guest(env, callback) {
    N.wire.emit('internal:users.force_login_guest', env, callback);
  });


  // Fetch topic
  //
  N.wire.before(apiPath, function fetch_topic(env, callback) {
    N.models.forum.Topic
        .findOne({ hid: env.params.topic_hid })
        .lean(true)
        .exec(function (err, topic) {

      if (err) {
        callback(err);
        return;
      }

      if (!topic) {
        callback(N.io.NOT_FOUND);
        return;
      }

      env.data.topic = topic;
      callback();
    });
  });


  // Fetch section
  //
  N.wire.before(apiPath, function fetch_section(env, callback) {
    N.models.forum.Section
        .findOne({ _id: env.data.topic.section })
        .lean(true)
        .exec(function (err, section) {

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


  // Check if user can view this topic
  //
  N.wire.before(apiPath, function check_access(env, callback) {
    var access_env = { params: { topics: env.data.topic, user_info: env.user_info } };

    N.wire.emit('internal:forum.access.topic', access_env, function (err) {
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


  // Fetch subscription
  //
  N.wire.before(apiPath, function fetch_subscription(env, callback) {
    N.models.users.Subscription.findOne({ user_id: env.user_info.user_id, to: env.data.topic._id })
        .lean(true)
        .exec(function (err, subscription) {

      if (err) {
        callback(err);
        return;
      }

      env.data.subscription = subscription;
      callback();
    });
  });


  // Update subscription type
  //
  N.wire.on(apiPath, function update_subscription_type(env, callback) {
    // Shortcut
    var Subscription = N.models.users.Subscription;

    var curType = env.data.subscription ? env.data.subscription.type : Subscription.types.NORMAL;
    var updatedType;

    if ([ Subscription.types.WATCHING, Subscription.types.TRACKING ].indexOf(curType) !== -1) {
      // `WATCHING|TRACKING -> NORMAL`
      updatedType = Subscription.types.NORMAL;
    } else if (curType === Subscription.types.NORMAL) {
      // `NORMAL -> MUTED`
      updatedType = Subscription.types.MUTED;
    } else {
      // Nothing to update here, just fill subscription type
      env.res.subscription = curType;
      callback();
      return;
    }

    // Fill subscription type
    env.res.subscription = updatedType;

    // Update with `upsert` to avoid duplicates
    Subscription.update(
      { user_id: env.user_info.user_id, to: env.data.topic._id },
      { type: updatedType, to_type: Subscription.to_types.FORUM_TOPIC },
      { upsert: true },
      callback
    );
  });


  // Fill section
  //
  N.wire.after(apiPath, function fill_section(env, callback) {
    sanitize_section(N, env.data.section, env.user_info, function (err, res) {
      if (err) {
        callback(err);
        return;
      }

      env.res.section = res;
      callback();
    });
  });


  // Fill topic
  //
  N.wire.after(apiPath, function fill_topic(env, callback) {
    sanitize_topic(N, env.data.topic, env.user_info, function (err, res) {
      if (err) {
        callback(err);
        return;
      }

      env.res.topic = res;
      callback();
    });
  });


  // Fill head meta
  //
  N.wire.after(apiPath, function fill_meta(env) {
    env.res.head = env.res.head || {};

    env.res.head.title = env.t('title', { topic_title: env.data.topic.title });
  });
};
