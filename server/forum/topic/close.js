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


  // Check if user has an access to this topic
  //
  N.wire.before(apiPath, function check_access(env, callback) {
    N.wire.emit('internal:forum.access.topic', {
      env:    env,
      params: { topic_hid: env.data.topic.hid }
    }, function (err) {
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
      if ((env.user_info.user_id !== String(env.data.topic.cache.first_user)) || !settings.forum_can_close_topic) {
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

    var res = { st: update.st || topic.st, ste: update.ste || topic.ste };

    // Show `ste` instead `st` for hellbanned users in hellbanned topic
    if (env.user_info.hb && res.st === statuses.HB && !env.data.can_see_hellbanned) {
      res.st = res.ste;
      delete res.ste;
    }

    env.res.topic = res;

    N.models.forum.Topic.update(
      { _id: topic._id },
      update,
      callback
    );
  });


  // TODO: log moderator actions
};
