// Bulk remove posts by id
//
'use strict';


const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid:    { type: 'integer', required: true },
    posts_ids: {
      type: 'array',
      required: true,
      uniqueItems: true,
      items: { format: 'mongo', required: true }
    },
    reason: { type: 'string' },
    method: { type: 'string', 'enum': [ 'hard', 'soft' ], required: true }
  });


  const statuses = N.models.forum.Post.statuses;


  // Fetch topic
  //
  N.wire.before(apiPath, function* fetch_topic(env) {
    env.data.topic = yield N.models.forum.Topic.findOne({ hid: env.params.topic_hid }).lean(true);
    if (!env.data.topic) throw N.io.NOT_FOUND;
  });


  // Check if user has an access to this topic
  //
  N.wire.before(apiPath, function* check_access(env) {
    let access_env = { params: { topics: env.data.topic, user_info: env.user_info } };

    yield N.wire.emit('internal:forum.access.topic', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Check permissions
  //
  N.wire.before(apiPath, function* check_permissions(env) {
    env.extras.settings.params.section_id = env.data.topic.section;

    // We can't delete first port. Topic operation should be requested instead
    env.params.posts_ids.forEach(postId => {
      if (String(env.data.topic.cache.first_post) === postId) {
        throw N.io.BAD_REQUEST;
      }
    });

    // Check moderator permissions
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
  });


  // Fetch posts
  //
  N.wire.before(apiPath, function* fetch_posts(env) {
    env.data.posts = yield N.models.forum.Post.find()
                              .where('_id').in(env.params.posts_ids)
                              .where('topic').equals(env.data.topic._id)
                              .where('st').in(statuses.LIST_DELETABLE)
                              .lean(true);

    if (!env.data.posts.length) throw N.io.NOT_FOUND;
  });


  // Remove post
  //
  N.wire.on(apiPath, function* delete_posts(env) {
    let bulk = N.models.forum.Post.collection.initializeUnorderedBulkOp();

    env.data.posts.forEach(post => {
      let setData = {
        st: env.params.method === 'hard' ? statuses.DELETED_HARD : statuses.DELETED,
        prev_st: _.pick(post, [ 'st', 'ste' ]),
        del_by: env.user_info.user_id
      };

      if (env.params.reason) setData.del_reason = env.params.reason;

      bulk.find({ _id: post._id }).updateOne({
        $set: setData,
        $unset: { ste: 1 }
      });
    });

    yield bulk.execute();
  });


  // Update topic counters
  //
  N.wire.after(apiPath, function* update_topic(env) {
    let statuses = N.models.forum.Post.statuses;
    let incData = {};
    let visiblePosts = env.data.posts.filter(post => post.st === statuses.VISIBLE);
    let hbPosts = env.data.posts.filter(post => post.st === statuses.HB);

    if (visiblePosts.length) {
      incData['cache.post_count'] = -visiblePosts.length;
    }

    if (hbPosts.length) {
      incData['cache_hb.post_count'] = -hbPosts.length;
    }

    yield N.models.forum.Topic.update(
      { _id: env.data.topic._id },
      { $inc: incData }
    );

    yield N.models.forum.Topic.updateCache(env.data.topic._id, true);
  });


  // Remove votes
  //
  N.wire.after(apiPath, function* remove_votes(env) {
    yield N.models.users.Vote.collection.update(
      { 'for': { $in: _.map(env.data.posts, '_id') } },
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


  // Update section counters
  //
  N.wire.after(apiPath, function* update_section(env) {
    let topic = env.data.topic;
    let incData = {};
    let visiblePosts = env.data.posts.filter(post => post.st === statuses.VISIBLE);
    let hbPosts = env.data.posts.filter(post => post.st === statuses.HB);

    if (visiblePosts.length) {
      incData['cache.post_count'] = -visiblePosts.length;
    }

    if (hbPosts.length) {
      incData['cache_hb.post_count'] = -hbPosts.length;
    }

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
