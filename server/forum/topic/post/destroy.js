// Remove post by id
//
'use strict';


const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id:      { format: 'mongo', required: true },
    reason:       { type: 'string' },
    method:       { type: 'string', 'enum': [ 'hard', 'soft' ], required: true },
    as_moderator: { type: 'boolean', required: true }
  });


  // Fetch post
  //
  N.wire.before(apiPath, function* fetch_post(env) {
    let post = yield N.models.forum.Post.findOne({ _id: env.params.post_id }).lean(true);

    if (!post) throw N.io.NOT_FOUND;

    env.data.post = post;
  });


  // Fetch topic
  //
  N.wire.before(apiPath, function* fetch_topic(env) {
    let topic = yield N.models.forum.Topic.findOne({ _id: env.data.post.topic }).lean(true);

    if (!topic) throw N.io.NOT_FOUND;

    env.data.topic = topic;
  });


  // Check if user can see this post
  //
  N.wire.before(apiPath, function* check_access(env) {
    let access_env = { params: {
      posts: env.data.post,
      user_info: env.user_info,
      preload: [ env.data.topic ]
    } };

    yield N.wire.emit('internal:forum.access.post', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Check permissions
  //
  N.wire.before(apiPath, function* check_permissions(env) {
    env.extras.settings.params.section_id = env.data.topic.section;

    // We can't delete first port. Topic operation should be requested instead
    if (String(env.data.topic.cache.first_post) === String(env.data.post._id)) {
      throw N.io.NOT_FOUND;
    }

    // Check moderator permissions

    if (env.params.as_moderator) {
      let settings = yield env.extras.settings.fetch([
        'forum_mod_can_delete_topics',
        'forum_mod_can_hard_delete_topics'
      ]);

      if (!settings.forum_mod_can_delete_topics && env.params.method === 'soft') {
        throw N.io.FORBIDDEN;
      }

      if (!settings.forum_mod_can_hard_delete_topics && env.params.method === 'hard') {
        throw N.io.FORBIDDEN;
      }

      return;
    }

    // Check user permissions

    // User can't hard delete posts
    if (env.params.method === 'hard') throw N.io.FORBIDDEN;

    // Check post owner
    if (env.user_info.user_id !== String(env.data.post.user)) {
      throw N.io.FORBIDDEN;
    }

    let forum_edit_max_time = yield env.extras.settings.fetch('forum_edit_max_time');

    if (forum_edit_max_time !== 0 && env.data.post.ts < Date.now() - forum_edit_max_time * 60 * 1000) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_perm_expired')
      };
    }
  });


  // Remove post
  //
  N.wire.on(apiPath, function* delete_post(env) {
    let statuses = N.models.forum.Post.statuses;
    let post = env.data.post;
    let update = {
      st: env.params.method === 'hard' ? statuses.DELETED_HARD : statuses.DELETED,
      $unset: { ste: 1 },
      prev_st: _.pick(post, [ 'st', 'ste' ]),
      del_by: env.user_info.user_id
    };

    if (env.params.reason) {
      update.del_reason = env.params.reason;
    }

    yield N.models.forum.Post.update({ _id: post._id }, update);
  });


  // Update topic counters
  //
  N.wire.after(apiPath, function* update_topic(env) {
    yield N.models.forum.Topic.updateCache(env.data.topic._id);
  });


  // Remove votes
  //
  N.wire.after(apiPath, function* remove_votes(env) {
    yield N.models.users.Vote.collection.update(
      { 'for': env.data.post._id },
      // Just move vote `value` field to `backup` field
      { $rename: { value: 'backup' } },
      { multi: true }
    );
  });


  // Increment topic version to invalidate old post count cache
  //
  N.wire.after(apiPath, function* remove_old_post_count_cache(env) {
    yield N.models.forum.Topic.update({ _id: env.data.topic._id }, { $inc: { version: 1 } });
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, function* add_search_index(env) {
    yield N.queue.forum_topics_search_update_by_ids([ env.data.topic._id ]).postpone();
    yield N.queue.forum_posts_search_update_by_ids([ env.data.post._id ]).postpone();
  });


  // Update section counters
  //
  N.wire.after(apiPath, function* update_section(env) {
    yield N.models.forum.Section.updateCache(env.data.topic.section);
  });

  // TODO: log moderator actions
};
