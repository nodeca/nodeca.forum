// Pin/unpin topic by hid
'use strict';

// topic and post statuses
var statuses   = require('nodeca.forum/server/forum/_lib/statuses.js');

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid: { type: 'integer', minimum: 1, required: true }
  });


  // Fetch topic
  //
  N.wire.before(apiPath, function fetch_topic(env, callback) {
    N.models.forum.Topic.findOne({ hid: env.params.topic_hid })
      .lean(true).exec(function (err, topic) {
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

      if ([ statuses.topic.OPEN, statuses.topic.CLOSED, statuses.topic.PINNED ].indexOf(env.data.topic.st) === -1) {
        callback(N.io.FORBIDDEN);
        return;
      }

      callback();
    });
  });


  // Pin/unpin topic
  //
  N.wire.on(apiPath, function pin_topic(env, callback) {
    // TODO: statuses history

    var topic = env.data.topic;

    if (topic.st === statuses.topic.PINNED) {
      env.res.pinned = false;

      N.models.forum.Topic.update(
        { _id: topic._id },
        { st: topic.ste, $unset: { ste: 1 } },
        callback
      );
      return;
    }

    env.res.pinned = true;

    N.models.forum.Topic.update(
      { _id: topic._id },
      { st: statuses.topic.PINNED, ste: topic.st },
      callback
    );
  });

  // TODO: log moderator actions
};
