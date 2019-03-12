// Many remove posts by id
//
'use strict';


const _ = require('lodash');


// apply $set and $unset operations on an object
function mongo_apply(object, ops) {
  let result = Object.assign({}, object);

  for (let [ k, v ]  of Object.entries(ops)) {
    if (k === '$set') {
      Object.assign(result, v);
      continue;
    }

    if (k === '$unset') {
      for (let delete_key of Object.keys(v)) {
        delete result[delete_key];
      }
      continue;
    }

    result[k] = v;
  }

  return result;
}


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid: { type: 'integer', required: true },
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
  N.wire.before(apiPath, async function fetch_topic(env) {
    env.data.topic = await N.models.forum.Topic.findOne({ hid: env.params.topic_hid }).lean(true);
    if (!env.data.topic) throw N.io.NOT_FOUND;
  });


  // Check if user has an access to this topic
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: { topics: env.data.topic, user_info: env.user_info } };

    await N.wire.emit('internal:forum.access.topic', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    env.extras.settings.params.section_id = env.data.topic.section;

    // We can't delete first post. Topic operation should be requested instead
    env.params.posts_ids.forEach(postId => {
      if (String(env.data.topic.cache.first_post) === postId) {
        throw N.io.BAD_REQUEST;
      }
    });

    // Check moderator permissions
    let settings = await env.extras.settings.fetch([
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
  N.wire.before(apiPath, async function fetch_posts(env) {
    env.data.posts = await N.models.forum.Post.find()
                              .where('_id').in(env.params.posts_ids)
                              .where('topic').equals(env.data.topic._id)
                              .where('st').in(statuses.LIST_DELETABLE)
                              .lean(true);

    if (!env.data.posts.length) throw { code: N.io.CLIENT_ERROR, message: env.t('err_no_posts') };
  });


  // Remove post
  //
  N.wire.on(apiPath, async function delete_posts(env) {
    env.data.changes = [];

    let bulk = N.models.forum.Post.collection.initializeUnorderedBulkOp();

    env.data.posts.forEach(post => {
      let setData = {
        st: env.params.method === 'hard' ? statuses.DELETED_HARD : statuses.DELETED,
        prev_st: _.pick(post, [ 'st', 'ste' ]),
        del_by: env.user_info.user_id
      };

      if (env.params.reason) setData.del_reason = env.params.reason;

      let update = {
        $set: setData,
        $unset: { ste: 1 }
      };

      env.data.changes.push({
        old_post: post,
        new_post: mongo_apply(post, update)
      });

      bulk.find({ _id: post._id }).updateOne(update);
    });

    await bulk.execute();
  });


  // Save old version in history
  //
  N.wire.after(apiPath, function save_history(env) {
    return N.models.forum.PostHistory.add(
      env.data.changes,
      {
        user: env.user_info.user_id,
        role: N.models.forum.PostHistory.roles.MODERATOR,
        ip:   env.req.ip
      }
    );
  });


  // Update topic counters
  //
  N.wire.after(apiPath, async function update_topic(env) {
    await N.models.forum.Topic.updateCache(env.data.topic._id);
  });


  // Remove votes
  //
  N.wire.after(apiPath, async function remove_votes(env) {
    await N.models.users.Vote.updateMany(
      { 'for': { $in: _.map(env.data.posts, '_id') } },
      // Just move vote `value` field to `backup` field
      { $rename: { value: 'backup' } }
    );
  });


  // Increment topic version to invalidate old post count cache
  //
  N.wire.after(apiPath, async function remove_old_post_count_cache(env) {
    await N.models.forum.Topic.updateOne({ _id: env.data.topic._id }, { $inc: { version: 1 } });
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function add_search_index(env) {
    await N.queue.forum_topics_search_update_by_ids([ env.data.topic._id ]).postpone();
    await N.queue.forum_posts_search_update_by_ids(env.data.posts.map(p => p._id)).postpone();
  });


  // Update section counters
  //
  N.wire.after(apiPath, async function update_section(env) {
    await N.models.forum.Section.updateCache(env.data.topic.section);
  });
};
