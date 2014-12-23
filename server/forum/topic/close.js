// Close/open topic
//

'use strict';

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_id:     { format: 'mongo', required: true },
    reopen:       { type: 'boolean', required: true },
    as_moderator: { type: 'boolean', required: true }
  });


  // Fetch topic
  //
  N.wire.before(apiPath, function fetch_topic(env, callback) {
    var statuses = N.models.forum.Topic.statuses;

    N.models.forum.Topic
      .findOne({
        _id: env.params.topic_id,
        st: { $in: [ statuses.OPEN, statuses.CLOSED, statuses.PINNED, statuses.HB ] }
      })
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

    env.extras.settings.fetch([ 'forum_can_close_topic', 'forum_mod_can_close_topic' ], function (err, settings) {

      if (err) {
        callback(err);
        return;
      }

      // Permit open/close as moderator
      if (settings.forum_mod_can_close_topic && env.params.as_moderator) {
        callback();
        return;
      }

      // Check topic owner and `forum_can_close_topic` permission
      if ((env.session.user_id !== String(env.data.topic.cache.first_user)) || !settings.forum_can_close_topic) {
        callback(N.io.FORBIDDEN);
        return;
      }

      callback();
    });
  });


  // Update topic status
  //
  N.wire.on(apiPath, function update_topic(env, callback) {
    var statuses = N.models.forum.Topic.statuses;
    var topic = env.data.topic;
    var update;
    var newStatus = env.params.reopen ? statuses.OPEN : statuses.CLOSED;

    if (topic.st === statuses.PINNED || topic.st === statuses.HB) {
      update = { ste: newStatus };
    } else {
      update = { st: newStatus };
    }

    N.models.forum.Topic.update(
      { _id: topic._id },
      update,
      callback
    );
  });


  // TODO: log moderator actions
};
