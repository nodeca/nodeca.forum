// Undelete removed posts by id
//
'use strict';


const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid: { type: 'integer', required: true },
    posts_ids: {
      type: 'array',
      required: true,
      uniqueItems: true,
      items: { format: 'mongo', required: true }
    }
  });


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

    // We can't delete first port. Topic operation should be requested instead
    env.params.posts_ids.forEach(postId => {
      if (String(env.data.topic.cache.first_post) === postId) {
        throw N.io.BAD_REQUEST;
      }
    });
  });


  // Fetch posts & check permissions
  //
  N.wire.before(apiPath, async function fetch_posts(env) {
    env.extras.settings.params.section_id = env.data.topic.section;

    // Fetch moderator permissions
    let settings = await env.extras.settings.fetch([
      'forum_mod_can_delete_topics',
      'forum_mod_can_hard_delete_topics'
    ]);

    let st = [];

    if (settings.forum_mod_can_delete_topics) {
      st.push(N.models.forum.Post.statuses.DELETED);
    }

    if (settings.forum_mod_can_hard_delete_topics) {
      st.push(N.models.forum.Post.statuses.DELETED_HARD);
    }

    if (!st.length) {
      throw N.io.FORBIDDEN;
    }

    env.data.posts = await N.models.forum.Post.find()
                              .where('_id').in(env.params.posts_ids)
                              .where('topic').equals(env.data.topic._id)
                              .where('st').in(st)
                              .select('_id prev_st')
                              .lean(true);

    if (!env.data.posts.length) throw { code: N.io.CLIENT_ERROR, message: env.t('err_no_posts') };
  });


  // Undelete posts
  //
  N.wire.on(apiPath, async function undelete_posts(env) {
    let bulk = N.models.forum.Post.collection.initializeUnorderedBulkOp();

    env.data.posts.forEach(post => {
      bulk.find({ _id: post._id }).updateOne({
        $set: post.prev_st,
        $unset: { del_reason: 1, prev_st: 1, del_by: 1 }
      });
    });

    await bulk.execute();
  });


  // Restore votes
  //
  N.wire.after(apiPath, async function remove_votes(env) {
    await N.models.users.Vote.collection.update(
      { 'for': { $in: _.map(env.data.posts, '_id') } },
      // Just move vote `backup` field back to `value` field
      { $rename: { backup: 'value' } },
      { multi: true }
    );
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function add_search_index(env) {
    await N.queue.forum_topics_search_update_by_ids([ env.data.topic._id ]).postpone();
    await N.queue.forum_posts_search_update_by_ids(env.data.posts.map(p => p._id)).postpone();
  });


  // Update cache
  //
  N.wire.after(apiPath, async function update_cache(env) {
    await N.models.forum.Topic.updateCache(env.data.topic._id);
    await N.models.forum.Section.updateCache(env.data.topic.section);
  });

  // TODO: log moderator actions
};
