// Update topic title
//

'use strict';

var punycode = require('punycode');

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid:        { type: 'integer', required: true },
    title:            { type: 'string', minLength: 1, required: true },
    as_moderator:     { type: 'boolean', required: true }
  });


  // Check title length
  //
  N.wire.before(apiPath, function check_title_length(env, callback) {
    env.extras.settings.fetch('forum_topic_title_min_length', function (err, min_length) {
      if (err) {
        callback(err);
        return;
      }

      if (punycode.ucs2.decode(env.params.title.trim()).length < min_length) {
        // Real check is done on the client, no need to care about details here
        callback(N.io.BAD_REQUEST);
        return;
      }

      callback();
    });
  });


  // Fetch topic
  //
  N.wire.before(apiPath, function fetch_topic(env, callback) {
    var statuses = N.models.forum.Topic.statuses;

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

      // Can edit titles only in opened topics
      if (topic.st !== statuses.OPEN && topic.ste !== statuses.OPEN) {
        callback(N.io.NOT_FOUND);
        return;
      }

      env.data.topic = topic;
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


  // Check permissions
  //
  N.wire.before(apiPath, function check_permissions(env, callback) {

    env.extras.settings.params.section_id = env.data.topic.section;

    env.extras.settings.fetch('forum_mod_can_edit_titles', function (err, forum_mod_can_edit_titles) {

      if (err) {
        callback(err);
        return;
      }

      // Permit as moderator
      if (forum_mod_can_edit_titles && env.params.as_moderator) {
        callback();
        return;
      }

      // Check is user topic owner
      if (env.user_info.user_id !== String(env.data.topic.cache.first_user)) {
        callback(N.io.FORBIDDEN);
        return;
      }

      env.extras.settings.fetch('forum_edit_max_time', function (err, forum_edit_max_time) {

        if (err) {
          callback(err);
          return;
        }

        // Check, that topic created not more than 30 minutes ago
        if (forum_edit_max_time !== 0 && env.data.topic.cache.first_ts < Date.now() - forum_edit_max_time * 60 * 1000) {
          callback(N.io.FORBIDDEN);
          return;
        }

        callback();
      });
    });
  });


  // Update topic title
  //
  N.wire.on(apiPath, function update_topic(env, callback) {
    N.models.forum.Topic.update(
      { _id: env.data.topic._id },
      { title: env.params.title.trim() },
      callback
    );
  });


  // TODO: log moderator actions
};
