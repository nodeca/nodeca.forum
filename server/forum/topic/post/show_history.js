// Show post edit history
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id: { format: 'mongo', required: true }
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
      posts: env.data.post,
      user_info: env.user_info,
      preload: [ env.data.topic ]
    } };

    await N.wire.emit('internal:forum.access.post', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Fetch and return post edit history
  //
  N.wire.on(apiPath, async function get_post_history(env) {
    let history = await N.models.forum.PostHistory.find()
                            .where('post').equals(env.data.post._id)
                            .sort('revision')
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
