// Show post edit history
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id: { format: 'mongo', required: true }
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let can_see_history = await env.extras.settings.fetch('can_see_history');

    if (!can_see_history) throw N.io.FORBIDDEN;
  });


  // Fetch post
  //
  N.wire.before(apiPath, async function fetch_post(env) {
    let post = await N.models.forum.Post.findById(env.params.post_id).lean(true);

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


  // Check if user can see this post
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: {
      topics: env.data.topic,
      user_info: env.user_info
    } };

    await N.wire.emit('internal:forum.access.topic', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;

    // Check permissions manually here instead of calling `forum.access.post`
    // to account for deleted posts (history should still be shown to
    // moderators).
    //
    env.extras.settings.params.section_id = env.data.topic.section;
    env.data.settings = await env.extras.settings.fetch([
      'can_see_hellbanned',
      'forum_mod_can_delete_topics',
      'forum_mod_can_hard_delete_topics'
    ]);

    let postVisibleSt = [ N.models.forum.Post.statuses.VISIBLE ];

    if (env.data.settings.can_see_hellbanned || env.user_info.hb) {
      postVisibleSt.push(N.models.forum.Post.statuses.HB);
    }

    if (env.data.settings.forum_mod_can_delete_topics) {
      postVisibleSt.push(N.models.forum.Post.statuses.DELETED);
    }

    if (env.data.settings.forum_mod_can_see_hard_deleted_topics) {
      postVisibleSt.push(N.models.forum.Post.statuses.DELETED_HARD);
    }

    if (postVisibleSt.indexOf(env.data.post.st) === -1) throw N.io.NOT_FOUND;
  });


  // Fetch and return post edit history
  //
  N.wire.on(apiPath, async function get_post_history(env) {
    let history = await N.models.forum.PostHistory.find()
                            .where('post').equals(env.data.post._id)
                            .sort('_id')
                            .lean(true);

    env.res.history = [];

    let previous_user = env.data.post.user;
    let previous_ts   = env.data.post.ts;

    env.data.users = env.data.users || [];
    env.data.users.push(env.data.post.user);

    // unfold history, so each item would have user corresponding to its text
    for (let item of history) {
      env.res.history.push({
        md:    item.md,
        tail:  item.tail,
        title: item.title,
        ts:    previous_ts,
        user:  previous_user
      });

      previous_user = item.user;
      previous_ts   = item.ts;

      env.data.users.push(item.user);
    }

    // last item will have current post text and last editor
    /* eslint-disable no-undefined */
    env.res.history.push({
      md:    env.data.post.md,
      tail:  env.data.post.tail,
      title: env.data.post.hid <= 1 ? env.data.topic.title : undefined,
      ts:    previous_ts,
      user:  previous_user
    });
  });
};
