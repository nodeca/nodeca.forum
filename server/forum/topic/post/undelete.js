// Undelete removed post by id
//
'use strict';


const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id: { format: 'mongo', required: true }
  });


  // Fetch post
  //
  N.wire.before(apiPath, async function fetch_post(env) {
    let post = await N.models.forum.Post.findOne({ _id: env.params.post_id }).lean(true);

    if (!post) throw N.io.NOT_FOUND;

    env.data.post = post;
  });


  // Fetch topic
  //
  N.wire.before(apiPath, async function fetch_topic(env) {
    let topic = await N.models.forum.Topic.findOne({ _id: env.data.post.topic }).lean(true);

    if (!topic) throw N.io.NOT_FOUND;

    env.data.topic = topic;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let statuses = N.models.forum.Post.statuses;

    env.extras.settings.params.section_id = env.data.topic.section;

    // We can't undelete first port. Topic operation should be requested instead
    if (String(env.data.topic.cache.first_post) === String(env.data.post._id)) {
      throw N.io.FORBIDDEN;
    }

    let settings = await env.extras.settings.fetch([
      'forum_mod_can_delete_topics',
      'forum_mod_can_see_hard_deleted_topics'
    ]);

    if (env.data.post.st === statuses.DELETED && settings.forum_mod_can_delete_topics) {
      return;
    }

    if (env.data.post.st === statuses.DELETED_HARD && settings.forum_mod_can_see_hard_deleted_topics) {
      return;
    }

    // We should not show, that topic exists if no permissions
    throw N.io.NOT_FOUND;
  });


  // Undelete post
  //
  N.wire.on(apiPath, async function undelete_post(env) {
    let post = env.data.post;

    let update = {
      $unset: { del_reason: 1, prev_st: 1, del_by: 1 }
    };

    _.assign(update, post.prev_st);

    await N.models.forum.Post.update({ _id: post._id }, update);
  });


  // Update topic counters
  //
  N.wire.after(apiPath, async function update_topic(env) {
    await N.models.forum.Topic.updateCache(env.data.topic._id);
  });


  // Restore votes
  //
  N.wire.after(apiPath, async function restore_votes(env) {
    await N.models.users.Vote.collection.update(
      { 'for': env.data.post._id },
      // Just move vote `backup` field back to `value` field
      { $rename: { backup: 'value' } },
      { multi: true }
    );
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function add_search_index(env) {
    await N.queue.forum_topics_search_update_by_ids([ env.data.topic._id ]).postpone();
    await N.queue.forum_posts_search_update_by_ids([ env.data.post._id ]).postpone();
  });


  // Update section counters
  //
  N.wire.after(apiPath, async function update_section(env) {
    await N.models.forum.Section.updateCache(env.data.topic.section);
  });

  // TODO: log moderator actions
};
