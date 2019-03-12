// Pin/unpin topic by hid
'use strict';

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid: { type: 'integer', required: true },
    unpin:     { type: 'boolean', required: true }
  });


  // Fetch topic
  //
  N.wire.before(apiPath, async function fetch_topic(env) {
    var statuses = N.models.forum.Topic.statuses;
    var query = { hid: env.params.topic_hid };

    if (env.params.unpin) {
      query.st = statuses.PINNED;
    } else {
      query.st = { $in: statuses.LIST_VISIBLE };
    }

    env.data.topic = await N.models.forum.Topic
                              .findOne(query)
                              .lean(true);

    if (!env.data.topic) throw N.io.NOT_FOUND;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    env.extras.settings.params.section_id = env.data.topic.section;

    let forum_mod_can_pin_topic = await env.extras.settings.fetch('forum_mod_can_pin_topic');

    if (!forum_mod_can_pin_topic) throw N.io.FORBIDDEN;
  });


  // Pin/unpin topic
  //
  N.wire.on(apiPath, async function pin_topic(env) {
    var statuses = N.models.forum.Topic.statuses;
    var topic = env.data.topic;

    // Pin topic
    if (!env.params.unpin) {
      env.data.new_topic = await N.models.forum.Topic.findOneAndUpdate(
        { _id: topic._id },
        { st: statuses.PINNED, ste: topic.st },
        { 'new': true }
      );

      env.res.topic = { st: statuses.PINNED, ste: topic.st };
      return;
    }

    // Unpin topic
    env.data.new_topic = await N.models.forum.Topic.findOneAndUpdate(
      { _id: topic._id },
      { st: topic.ste, $unset: { ste: 1 } },
      { 'new': true }
    );

    env.res.topic = { st: topic.ste };
  });


  // Save old version in history
  //
  N.wire.after(apiPath, function save_history(env) {
    return N.models.forum.TopicHistory.add(
      {
        old_topic: env.data.topic,
        new_topic: env.data.new_topic
      },
      {
        user: env.user_info.user_id,
        role: N.models.forum.TopicHistory.roles.MODERATOR,
        ip:   env.req.ip
      }
    );
  });
};
