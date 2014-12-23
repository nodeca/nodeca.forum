// Pin/unpin topic by hid
'use strict';

// topic and post statuses
var statuses   = require('nodeca.forum/server/forum/_lib/statuses.js');

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_id: { format: 'mongo', required: true },
    unpin:    { type: 'boolean', required: true }
  });


  // Fetch topic
  //
  N.wire.before(apiPath, function fetch_topic(env, callback) {
    var query = { _id: env.params.topic_id };

    if (env.params.unpin) {
      query.st = statuses.topic.PINNED;
    } else {
      query.st = { $in: [ statuses.topic.OPEN, statuses.topic.CLOSED, statuses.topic.PINNED ] };
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
    var topic = env.data.topic;

    // Pin topic
    if (!env.params.unpin) {
      N.models.forum.Topic.update(
        { _id: topic._id },
        { st: statuses.topic.PINNED, ste: topic.st },
        callback
      );

      return;
    }

    // Unpin topic
    N.models.forum.Topic.update(
      { _id: topic._id },
      { st: topic.ste, $unset: { ste: 1 } },
      callback
    );
  });

  // TODO: log moderator actions
};
