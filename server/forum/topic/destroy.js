// Remove topic by id
'use strict';

var _ = require('lodash');

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid:    { type: 'integer', required: true },
    reason:       { type: 'string' },
    method:       { type: 'string', 'enum': [ 'hard', 'soft' ], required: true },
    as_moderator: { type: 'boolean', required: true }
  });


  // Fetch topic
  //
  N.wire.before(apiPath, function fetch_topic(env, callback) {
    var statuses = N.models.forum.Topic.statuses;

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

        if (topic.st === statuses.DELETED || topic.st === statuses.DELETED_HARD) {
          callback(N.io.NOT_FOUND);
          return;
        }

        env.data.topic = topic;
        callback();
      });
  });


  // Fetch first post
  //
  N.wire.before(apiPath, function fetch_post(env, callback) {
    N.models.forum.Post.findOne({ _id: env.data.topic.cache.first_post })
      .lean(true).exec(function (err, post) {
        if (err) {
          callback(err);
          return;
        }

        if (!post) {
          callback(N.io.NOT_FOUND);
          return;
        }

        env.data.post = post;
        callback();
      });
  });


  // Check if user has an access to this topic
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
    var topic = env.data.topic;

    env.extras.settings.params.section_id = env.data.topic.section;

    // Check moderator permissions

    if (env.params.as_moderator) {
      env.extras.settings.fetch(
        [ 'forum_mod_can_delete_topics', 'forum_mod_can_hard_delete_topics' ],
        function (err, settings) {
          if (err) {
            callback(err);
            return;
          }

          if (!settings.forum_mod_can_delete_topics && env.params.method === 'soft') {
            callback(N.io.FORBIDDEN);
            return;
          }

          if (!settings.forum_mod_can_hard_delete_topics && env.params.method === 'hard') {
            callback(N.io.FORBIDDEN);
            return;
          }

          callback();
        }
      );

      return;
    }

    // Check user permissions

    // User can't hard delete topics
    if (env.params.method === 'hard') {
      callback(N.io.FORBIDDEN);
      return;
    }

    // User can't delete topic with answers
    if (topic.cache.post_count !== 1 || topic.cache_hb.post_count !== 1) {
      callback({
        code: N.io.CLIENT_ERROR,
        message: env.t('err_delete_topic_with_answers')
      });
      return;
    }

    // Check owner of first post in topic
    if (env.user_info.user_id !== String(env.data.post.user)) {
      callback(N.io.FORBIDDEN);
      return;
    }

    env.extras.settings.fetch('forum_edit_max_time', function (err, forum_edit_max_time) {

      if (err) {
        callback(err);
        return;
      }

      if (forum_edit_max_time !== 0 && env.data.post.ts < Date.now() - forum_edit_max_time * 60 * 1000) {
        callback({
          code: N.io.CLIENT_ERROR,
          message: env.t('err_perm_expired')
        });
        return;
      }

      callback();
    });
  });


  // Remove topic
  //
  N.wire.on(apiPath, function delete_topic(env, callback) {
    var statuses = N.models.forum.Topic.statuses;

    var topic = env.data.topic;
    var update = {
      st: env.params.method === 'hard' ? statuses.DELETED_HARD : statuses.DELETED,
      $unset: { ste: 1 },
      prev_st: _.pick(topic, [ 'st', 'ste' ]),
      del_by: env.user_info.user_id
    };

    if (env.params.reason) {
      update.del_reason = env.params.reason;
    }

    env.res.topic = { st: update.st };

    N.models.forum.Topic.update(
      { _id: topic._id },
      update,
      callback
    );
  });


  // Remove votes
  //
  N.wire.after(apiPath, function remove_votes(env, callback) {
    var st = N.models.forum.Post.statuses;

    // IDs list can be very large for big topics, but this should work
    N.models.forum.Post.find({ topic: env.data.topic._id, st: { $in: [ st.VISIBLE, st.HB ] } })
      .select('_id')
      .lean(true)
      .exec(function (err, posts) {
        if (err) {
          callback(err);
          return;
        }

        N.models.users.Vote.collection.update(
          { 'for': { $in: _.map(posts, '_id') } },
          // Just move vote `value` field to `backup` field
          { $rename: { value: 'backup' } },
          { multi: true },
          function (err) {
            if (err) {
              callback(err);
              return;
            }

            callback();
          }
        );
      });
  });


  // Update section counters
  //
  N.wire.after(apiPath, function update_section(env, callback) {
    var statuses = N.models.forum.Topic.statuses;
    var topic = env.data.topic;
    var incData = {};

    if (topic.st !== statuses.HB) {
      incData['cache.post_count']  = -topic.cache.post_count;
      incData['cache.topic_count'] = -1;
    }

    incData['cache_hb.post_count']  = -topic.cache.post_count;
    incData['cache_hb.topic_count'] = -1;


    N.models.forum.Section.getParentList(topic.section, function (err, parents) {
      if (err) {
        callback(err);
        return;
      }

      N.models.forum.Section.update(
        { _id: { $in: parents.concat([ topic.section ]) } },
        { $inc: incData },
        { multi: true },
        function (err) {

          if (err) {
            callback(err);
            return;
          }

          N.models.forum.Section.updateCache(env.data.topic.section, true, callback);
        }
      );
    });
  });

  // TODO: log moderator actions
};
