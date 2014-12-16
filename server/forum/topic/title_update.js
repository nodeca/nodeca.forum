// Update topic title
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    moderator_action: { type: 'boolean', required: true },
    topic_id:         { format: 'mongo', required: true },
    title:            { type: 'string', minLength: 1, required: true }
  });


  // Fetch topic
  //
  N.wire.before(apiPath, function fetch_topic(env, callback) {
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
      if (forum_mod_can_edit_titles && env.params.moderator_action) {
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
      { title: env.params.title },
      callback
    );
  });


  // TODO: log moderator actions
};
