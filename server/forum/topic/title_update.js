// Update topic title
//

'use strict';

var punycode = require('punycode');

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_id:         { format: 'mongo', required: true },
    title:            { type: 'string', minLength: 1, required: true },
    as_moderator:     { type: 'boolean', required: true }
  });


  // Check title length
  //
  N.wire.before(apiPath, function check_title_length(env, callback) {
    env.extras.settings.fetch('topic_title_min_length', function (err, topic_title_min_length) {
      if (err) {
        callback(err);
        return;
      }

      if (punycode.ucs2.decode(env.params.title.trim()).length < topic_title_min_length) {
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
        .findOne({ _id: env.params.topic_id })
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
      if (env.session.user_id !== env.data.topic.cache.first_user.toString()) {
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
