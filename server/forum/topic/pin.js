// Pin/unpin topic by hid
'use strict';

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid: { type: 'integer', required: true },
    unpin:     { type: 'boolean', required: true }
  });


  // Fetch topic
  //
  N.wire.before(apiPath, function fetch_topic(env, callback) {
    var statuses = N.models.forum.Topic.statuses;
    var query = { hid: env.params.topic_hid };

    if (env.params.unpin) {
      query.st = statuses.PINNED;
    } else {
      query.st = { $in: statuses.LIST_VISIBLE };
    }

    N.models.forum.Topic
        .findOne(query)
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


  // Check permissions
  //
  N.wire.before(apiPath, function check_permissions(env, callback) {
    env.extras.settings.params.section_id = env.data.topic.section;

    env.extras.settings.fetch('forum_mod_can_pin_topic', function (err, forum_mod_can_pin_topic) {

      if (err) {
        callback(err);
        return;
      }

      if (!forum_mod_can_pin_topic) {
        callback(N.io.FORBIDDEN);
        return;
      }

      callback();
    });
  });


  // Pin/unpin topic
  //
  N.wire.on(apiPath, function pin_topic(env, callback) {
    var statuses = N.models.forum.Topic.statuses;
    var topic = env.data.topic;

    if (!env.params.unpin) {

      // Fill response
      env.res.topic = { st: statuses.PINNED, ste: topic.st };

      // Pin topic
      N.models.forum.Topic.update(
        { _id: topic._id },
        { st: statuses.PINNED, ste: topic.st },
        callback
      );

      return;
    }

    // Fill response
    env.res.topic = { st: topic.ste };

    // Unpin topic
    N.models.forum.Topic.update(
      { _id: topic._id },
      { st: topic.ste, $unset: { ste: 1 } },
      callback
    );
  });

  // TODO: log moderator actions
};
