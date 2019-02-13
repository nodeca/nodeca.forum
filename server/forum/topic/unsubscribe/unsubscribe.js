// Update subscription type and show unsubscribe topic page
//
// `WATCHING|TRACKING -> NORMAL -> MUTED`
//
'use strict';


const sanitize_topic   = require('nodeca.forum/lib/sanitizers/topic');
const sanitize_section = require('nodeca.forum/lib/sanitizers/section');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid: { type: 'integer', required: true },
    topic_hid:   { type: 'integer', required: true }
  });


  // Redirect guests to login page
  //
  N.wire.before(apiPath, async function force_login_guest(env) {
    await N.wire.emit('internal:users.force_login_guest', env);
  });


  // Fetch topic
  //
  N.wire.before(apiPath, async function fetch_topic(env) {
    let topic = await N.models.forum.Topic
                          .findOne({ hid: env.params.topic_hid })
                          .lean(true);
    if (!topic) throw N.io.NOT_FOUND;

    env.data.topic = topic;
  });


  // Fetch section
  //
  N.wire.before(apiPath, async function fetch_section(env) {
    let section = await N.models.forum.Section
                            .findOne({ _id: env.data.topic.section })
                            .lean(true);
    if (!section) throw N.io.NOT_FOUND;

    env.data.section = section;
  });


  // Check if user can view this topic
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: { topics: env.data.topic, user_info: env.user_info } };

    await N.wire.emit('internal:forum.access.topic', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Fetch subscription
  //
  N.wire.before(apiPath, async function fetch_subscription(env) {
    env.data.subscription = await N.models.users.Subscription
                                      .findOne({ user: env.user_info.user_id, to: env.data.topic._id })
                                      .lean(true);
  });


  // Update subscription type
  //
  N.wire.on(apiPath, async function update_subscription_type(env) {
    // Shortcut
    let Subscription = N.models.users.Subscription;

    let curType = env.data.subscription ? env.data.subscription.type : Subscription.types.NORMAL;
    let updatedType;

    if ([ Subscription.types.WATCHING, Subscription.types.TRACKING ].indexOf(curType) !== -1) {
      // `WATCHING|TRACKING -> NORMAL`
      updatedType = Subscription.types.NORMAL;
    } else if (curType === Subscription.types.NORMAL) {
      // `NORMAL -> MUTED`
      updatedType = Subscription.types.MUTED;
    } else {
      // Nothing to update here, just fill subscription type
      env.res.subscription = curType;
      return;
    }

    // Fill subscription type
    env.res.subscription = updatedType;

    // Update with `upsert` to avoid duplicates
    await Subscription.updateOne(
      { user: env.user_info.user_id, to: env.data.topic._id },
      { type: updatedType, to_type: N.shared.content_type.FORUM_TOPIC },
      { upsert: true }
    );
  });


  // Fill section
  //
  N.wire.after(apiPath, async function fill_section(env) {
    env.res.section = await sanitize_section(N, env.data.section, env.user_info);
  });


  // Fill topic
  //
  N.wire.after(apiPath, async function fill_topic(env) {
    env.res.topic = await sanitize_topic(N, env.data.topic, env.user_info);
  });


  // Fill head meta
  //
  N.wire.after(apiPath, function fill_meta(env) {
    env.res.head = env.res.head || {};

    env.res.head.title = env.t('title', { topic_title: env.data.topic.title });
  });
};
