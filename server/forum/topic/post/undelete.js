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
  N.wire.before(apiPath, function* fetch_post(env) {
    let post = yield N.models.forum.Post.findOne({ _id: env.params.post_id }).lean(true);

    if (!post) {
      throw N.io.NOT_FOUND;
    }

    env.data.post = post;
  });


  // Fetch topic
  //
  N.wire.before(apiPath, function* fetch_topic(env) {
    let topic = yield N.models.forum.Topic.findOne({ _id: env.data.post.topic }).lean(true);

    if (!topic) {
      throw N.io.NOT_FOUND;
    }

    env.data.topic = topic;
  });


  // Check permissions
  //
  N.wire.before(apiPath, function* check_permissions(env) {
    let statuses = N.models.forum.Post.statuses;

    env.extras.settings.params.section_id = env.data.topic.section;

    // We can't undelete first port. Topic operation should be requested instead
    if (String(env.data.topic.cache.first_post) === String(env.data.post._id)) {
      throw N.io.FORBIDDEN;
    }

    let settings = yield env.extras.settings.fetch([
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
  N.wire.on(apiPath, function* undelete_post(env) {
    let post = env.data.post;

    let update = {
      $unset: { del_reason: 1, prev_st: 1, del_by: 1 }
    };

    _.assign(update, post.prev_st);

    yield N.models.forum.Post.update({ _id: post._id }, update);
  });


  // Update topic counters
  //
  N.wire.after(apiPath, function* update_topic(env) {
    var statuses = N.models.forum.Post.statuses;
    var incData = {};

    if (env.data.post.prev_st.st === statuses.VISIBLE) {
      incData['cache.post_count'] = 1;
      incData['cache.attach_count'] = env.data.post.attach.length;
    }

    incData['cache_hb.post_count'] = 1;
    incData['cache_hb.attach_count'] = env.data.post.attach.length;


    yield N.models.forum.Topic.update(
      { _id: env.data.topic._id },
      { $inc: incData }
    );

    yield N.models.forum.Topic.updateCache(env.data.topic._id, true);
  });


  // Restore votes
  //
  N.wire.after(apiPath, function* restore_votes(env) {
    yield N.models.users.Vote.collection.update(
      { 'for': env.data.post._id },
      // Just move vote `backup` field back to `value` field
      { $rename: { backup: 'value' } },
      { multi: true }
    );
  });


  // Update section counters
  //
  N.wire.after(apiPath, function* update_section(env) {
    let statuses = N.models.forum.Post.statuses;
    let topic = env.data.topic;
    let incData = {};

    if (env.data.post.prev_st.st === statuses.VISIBLE) {
      incData['cache.post_count'] = 1;
    }

    incData['cache_hb.post_count'] = 1;

    let parents = yield N.models.forum.Section.getParentList(topic.section);

    yield N.models.forum.Section.update(
      { _id: { $in: parents.concat([ topic.section ]) } },
      { $inc: incData },
      { multi: true }
    );

    yield N.models.forum.Section.updateCache(env.data.topic.section, true);
  });

  // TODO: log moderator actions
};
