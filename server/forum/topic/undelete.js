// Undelete topic by id
//
'use strict';


const _ = require('lodash');
const sanitize_topic = require('nodeca.forum/lib/sanitizers/topic');


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

    env.data.new_topic = await N.models.forum.Topic.findOneAndUpdate(
      { _id: topic._id },
      update,
      { 'new': true }
    );
  });


  // Save old version in history
  //
  N.wire.after(apiPath, function save_history(env) {
    return N.models.forum.TopicHistory.add(
      {
        old_topic: env.data.topic,
        new_topic: env.data.new_topic
      },
      {
        user: env.user_info.user_id,
        role: N.models.forum.TopicHistory.roles.MODERATOR,
        ip:   env.req.ip
      }
    );
  });


  // Change topic status in all posts
  //
  N.wire.after(apiPath, function change_topic_status_in_posts(env) {
    return N.models.forum.Post.updateMany(
      { topic: env.data.topic._id },
      { $set: { topic_exists: true } }
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

    await N.models.users.Vote.updateMany(
      { 'for': { $in: _.map(posts, '_id') } },
      // Just move vote `backup` field back to `value` field
      { $rename: { backup: 'value' } }
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


  // Update user counters
  //
  N.wire.after(apiPath, async function update_user(env) {
    await N.models.forum.UserTopicCount.recount(env.data.topic.cache.first_user, env.data.topic.section);

    let users = _.map(
      await N.models.forum.Post.find()
                .where('topic').equals(env.data.topic._id)
                .select('user')
                .lean(true),
      'user'
    );

    await N.models.forum.UserPostCount.recount(
      _.uniq(users.map(String))
       .map(user_id => [ user_id, env.data.topic.section ])
    );
  });


  // Return changed topic info
  //
  N.wire.after(apiPath, async function return_topic(env) {
    let topic = await N.models.forum.Topic.findById(env.data.topic._id).lean(true);

    if (!topic) throw N.io.NOT_FOUND;

    env.res.topic = await sanitize_topic(N, topic, env.user_info);
  });
};
