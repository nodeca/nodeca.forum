// Undelete topic by id
//
'use strict';

const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid: { type: 'integer', required: true }
  });


  // Fetch topic
  //
  N.wire.before(apiPath, function* fetch_topic(env) {
    let topic = yield N.models.forum.Topic.findOne({ hid: env.params.topic_hid }).lean(true);

    if (!topic) throw N.io.NOT_FOUND;

    env.data.topic = topic;
  });


  // Check permissions
  //
  N.wire.before(apiPath, function* check_permissions(env) {
    let statuses = N.models.forum.Topic.statuses;

    env.extras.settings.params.section_id = env.data.topic.section;

    let settings = yield env.extras.settings.fetch([
      'forum_mod_can_delete_topics',
      'forum_mod_can_see_hard_deleted_topics'
    ]);

    if (env.data.topic.st === statuses.DELETED && settings.forum_mod_can_delete_topics) {
      return;
    }

    if (env.data.topic.st === statuses.DELETED_HARD && settings.forum_mod_can_see_hard_deleted_topics) {
      return;
    }

    // We should not show, that topic exists if no permissions
    throw N.io.NOT_FOUND;
  });


  // Undelete topic
  //
  N.wire.on(apiPath, function* undelete_topic(env) {
    let topic = env.data.topic;

    let update = {
      $unset: { del_reason: 1, prev_st: 1, del_by: 1 }
    };

    _.assign(update, topic.prev_st);

    env.res.topic = { st: update.st, ste: update.ste };

    yield N.models.forum.Topic.update({ _id: topic._id }, update);
  });


  // Restore votes
  //
  N.wire.after(apiPath, function* restore_votes(env) {
    let st = N.models.forum.Post.statuses;

    // IDs list can be very large for big topics, but this should work
    let posts = yield N.models.forum.Post.find({ topic: env.data.topic._id, st: { $in: [ st.VISIBLE, st.HB ] } })
      .select('_id')
      .lean(true);

    yield N.models.users.Vote.collection.update(
      { 'for': { $in: _.map(posts, '_id') } },
      // Just move vote `backup` field back to `value` field
      { $rename: { backup: 'value' } },
      { multi: true }
    );
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, function* add_search_index(env) {
    yield N.queue.forum_topics_search_update_with_posts([ env.data.topic._id ]).postpone();
  });


  // Update section counters
  //
  N.wire.after(apiPath, function* update_section(env) {
    yield N.models.forum.Section.updateCache(env.data.topic.section);
  });

  // TODO: log moderator actions
};
