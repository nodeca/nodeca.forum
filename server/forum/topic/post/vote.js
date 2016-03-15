// Vote post
'use strict';

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id: { format: 'mongo', required: true },
    value:   { type: 'integer', required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_auth(env) {
    if (env.user_info.is_guest) throw N.io.FORBIDDEN;
  });


  // Fetch post
  //
  N.wire.before(apiPath, function* fetch_post(env) {
    env.data.post = yield N.models.forum.Post
                              .findOne({ _id: env.params.post_id })
                              .lean(true);

    if (!env.data.post) throw N.io.NOT_FOUND;
  });


  // Fetch topic
  //
  N.wire.before(apiPath, function* fetch_topic(env) {
    env.data.topic = yield N.models.forum.Topic
                              .findOne({ _id: env.data.post.topic })
                              .lean(true);

    if (!env.data.topic) throw N.io.NOT_FOUND;
  });


  // Check section flags
  //
  N.wire.before(apiPath, function* check_section_flags(env) {
    let section = yield N.models.forum.Section
                            .findOne({ _id: env.data.topic.section })
                            .select('is_enabled is_votable is_writeble')
                            .lean(true);

    if (!section) throw N.io.NOT_FOUND;
    if (!section.is_enabled) throw N.io.NOT_FOUND;

    // Votes disabled in this section
    if (!section.is_votable) throw N.io.FORBIDDEN;

    // Can not create topic in read only section. Should never happens - restricted on client
    if (!section.is_writeble) throw N.io.BAD_REQUEST;
  });


  // Check if user can see this post
  //
  N.wire.before(apiPath, function* check_access(env) {
    var access_env = { params: { topic: env.data.topic, posts: env.data.post, user_info: env.user_info } };

    yield N.wire.emit('internal:forum.access.post', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Check topic permissions
  //
  N.wire.before(apiPath, function* check_topic_permissions(env) {
    let topic = env.data.topic;

    env.extras.settings.params.section_id = topic.section;

    let can_vote = yield env.extras.settings.fetch('can_vote');

    if (!can_vote) throw N.io.FORBIDDEN;
  });


  // Check post permissions
  //
  N.wire.before(apiPath, function* check_post_permissions(env) {
    let post = env.data.post;
    let votes_add_max_time = yield env.extras.settings.fetch('votes_add_max_time');

    // Check is own post
    if (post.user.equals(env.user_info.user_id)) {
      // Hardcode msg, because that should never happen
      throw {
        code: N.io.CLIENT_ERROR,
        message: "Can't vote own post"
      };
    }

    if (votes_add_max_time !== 0 && post.ts < Date.now() - votes_add_max_time * 60 * 60 * 1000) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_perm_expired')
      };
    }
  });


  // Remove previous vote if exists
  //
  N.wire.before(apiPath, function* remove_votes(env) {
    yield N.models.users.Vote.remove(
      { 'for': env.params.post_id, from: env.user_info.user_id });
  });


  // Add vote
  //
  N.wire.on(apiPath, function* add_vote(env) {
    if (env.params.value === 0) return;

    yield N.models.users.Vote.update(
      { 'for': env.params.post_id, from: env.user_info.user_id },
      {
        to: env.data.post.user,
        type: N.models.users.Vote.types.FORUM_POST,
        value: env.params.value === 1 ? 1 : -1,
        hb: env.user_info.hb
      },
      { upsert: true });
  });


  // Update post
  //
  N.wire.after(apiPath, function* update_post(env) {
    let result = yield N.models.users.Vote.aggregate([
      { $match: { 'for': env.data.post._id } },
      {
        $group: {
          _id: null,
          votes: { $sum: { $cond: { 'if': '$hb', then: 0, 'else': '$value' } } },
          votes_hb: { $sum: '$value' }
        }
      },
      { $project: { _id: false, votes: true, votes_hb: true } }
    ]).exec();

    yield N.models.forum.Post.update({ _id: env.data.post._id }, result[0] || { votes: 0, votes_hb: 0 });
  });
};
