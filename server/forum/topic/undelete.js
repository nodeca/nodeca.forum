// Undelete topic by id
'use strict';

var _ = require('lodash');

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid: { type: 'integer', required: true }
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
    var statuses = N.models.forum.Topic.statuses;

    env.extras.settings.params.section_id = env.data.topic.section;

    env.extras.settings.fetch(
      [ 'forum_mod_can_delete_topics', 'forum_mod_can_see_hard_deleted_topics' ],
      function (err, settings) {
        if (err) {
          callback(err);
          return;
        }

        if (env.data.topic.st === statuses.DELETED && settings.forum_mod_can_delete_topics) {
          callback();
          return;
        }

        if (env.data.topic.st === statuses.DELETED_HARD && settings.forum_mod_can_see_hard_deleted_topics) {
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

    var update = {
      $unset: { del_reason: 1, prev_st: 1, del_by: 1 }
    };

    _.assign(update, topic.prev_st);

    env.res.topic = { st: update.st, ste: update.ste };

    N.models.forum.Topic.update(
      { _id: topic._id },
      update,
      callback
    );
  });


  // Restore votes
  //
  N.wire.after(apiPath, function restore_votes(env, callback) {
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
          // Just move vote `backup` field back to `value` field
          { $rename: { backup: 'value' } },
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

    if (topic.prev_st.st !== statuses.HB) {
      incData['cache.post_count']  = topic.cache.post_count;
      incData['cache.topic_count'] = 1;
    }

    incData['cache_hb.post_count']  = topic.cache.post_count;
    incData['cache_hb.topic_count'] = 1;


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
