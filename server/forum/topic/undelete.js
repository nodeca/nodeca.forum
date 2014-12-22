// Undelete topic by id
'use strict';

var _ = require('lodash');

// topic and post statuses
var statuses   = require('nodeca.forum/server/forum/_lib/statuses.js');

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_id: { format: 'mongo', required: true }
  });


  // Fetch topic
  //
  N.wire.before(apiPath, function fetch_topic(env, callback) {
    N.models.forum.Topic.findOne({ _id: env.params.topic_id })
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

    env.extras.settings.fetch(
      [ 'forum_mod_can_delete_topics', 'forum_mod_can_see_hard_deleted_topics' ],
      function (err, settings) {
        if (err) {
          callback(err);
          return;
        }

        if (env.data.topic.st === statuses.topic.DELETED && settings.forum_mod_can_delete_topics) {
          callback();
          return;
        }

        if (env.data.topic.st === statuses.topic.DELETED_HARD && settings.forum_mod_can_see_hard_deleted_topics) {
          callback();
          return;
        }

        // We should not show, that topic exists if no permissions
        callback(N.io.NOT_FOUND);
      }
    );
  });


  // Undelete topic
  //
  N.wire.on(apiPath, function undelete_topic(env, callback) {
    var topic = env.data.topic;
    var previousSt = topic.st_hist[topic.st_hist.length - 1];

    var update = {
      $push: {
        st_hist: _.pick(topic, [ 'st', 'ste', 'del_reason' ])
      },
      $unset: { del_reason: 1 }
    };

    _.assign(update, previousSt);

    N.models.forum.Topic.update(
      { _id: topic._id },
      update,
      callback
    );
  });

  // TODO: log moderator actions
};
