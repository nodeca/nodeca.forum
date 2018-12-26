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
  N.wire.before(apiPath, async function fetch_topic(env) {
    let topic = await N.models.forum.Topic.findOne({ hid: env.params.topic_hid }).lean(true);

    if (!topic) throw N.io.NOT_FOUND;

    env.data.topic = topic;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let statuses = N.models.forum.Topic.statuses;

    env.extras.settings.params.section_id = env.data.topic.section;

    let settings = await env.extras.settings.fetch([
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
  N.wire.on(apiPath, async function undelete_topic(env) {
    let topic = env.data.topic;

    let update = {
      $unset: { del_reason: 1, prev_st: 1, del_by: 1 }
    };

    _.assign(update, topic.prev_st);

    env.res.topic = { st: update.st, ste: update.ste };

    env.data.new_topic = await N.models.forum.Topic.findOneAndUpdate(
      { _id: topic._id },
      update,
      { 'new': true }
    );
  });


  // Save old version in history
  //
  N.wire.after(apiPath, function save_history(env) {
    return N.models.forum.PostHistory.add(
      {
        old_topic: env.data.topic,
        new_topic: env.data.new_topic
      },
      {
        user: env.user_info.user_id,
        role: N.models.forum.PostHistory.roles.MODERATOR,
        ip:   env.req.ip
      }
    );
  });


  // Restore votes
  //
  N.wire.after(apiPath, async function restore_votes(env) {
    let st = N.models.forum.Post.statuses;

    // IDs list can be very large for big topics, but this should work
    let posts = await N.models.forum.Post.find({ topic: env.data.topic._id, st: { $in: [ st.VISIBLE, st.HB ] } })
      .select('_id')
      .lean(true);

    await N.models.users.Vote.collection.update(
      { 'for': { $in: _.map(posts, '_id') } },
      // Just move vote `backup` field back to `value` field
      { $rename: { backup: 'value' } },
      { multi: true }
    );
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function add_search_index(env) {
    await N.queue.forum_topics_search_update_with_posts([ env.data.topic._id ]).postpone();
  });


  // Update section counters
  //
  N.wire.after(apiPath, async function update_section(env) {
    await N.models.forum.Section.updateCache(env.data.topic.section);
  });
};
