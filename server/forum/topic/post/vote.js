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
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // Fetch post
  //
  N.wire.before(apiPath, async function fetch_post(env) {
    env.data.post = await N.models.forum.Post
                              .findOne({ _id: env.params.post_id })
                              .lean(true);

    if (!env.data.post) throw N.io.NOT_FOUND;
  });


  // Fetch topic
  //
  N.wire.before(apiPath, async function fetch_topic(env) {
    env.data.topic = await N.models.forum.Topic
                              .findOne({ _id: env.data.post.topic })
                              .lean(true);

    if (!env.data.topic) throw N.io.NOT_FOUND;
  });


  // Check section flags
  //
  N.wire.before(apiPath, async function check_section_flags(env) {
    let section = await N.models.forum.Section
                            .findOne({ _id: env.data.topic.section })
                            .select('is_enabled is_votable is_writable')
                            .lean(true);

    if (!section) throw N.io.NOT_FOUND;
    if (!section.is_enabled) throw N.io.NOT_FOUND;

    // Votes disabled in this section
    if (!section.is_votable) throw N.io.FORBIDDEN;

    // Can not create topic in read only section. Should never happens - restricted on client
    if (!section.is_writable) throw N.io.BAD_REQUEST;
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


  // Check topic permissions
  //
  N.wire.before(apiPath, async function check_topic_permissions(env) {
    let topic = env.data.topic;

    env.extras.settings.params.section_id = topic.section;

    let can_vote = await env.extras.settings.fetch('can_vote');

    if (!can_vote) throw N.io.FORBIDDEN;
  });


  // Check post permissions
  //
  N.wire.before(apiPath, async function check_post_permissions(env) {
    let post = env.data.post;
    let votes_add_max_time = await env.extras.settings.fetch('votes_add_max_time');

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
  N.wire.before(apiPath, async function remove_votes(env) {
    await N.models.users.Vote.deleteOne(
      { for: env.params.post_id, from: env.user_info.user_id });
  });


  // Add vote
  //
  N.wire.on(apiPath, async function add_vote(env) {
    if (env.params.value === 0) return;

    await N.models.users.Vote.updateOne(
      { for: env.params.post_id, from: env.user_info.user_id },
      {
        to: env.data.post.user,
        type: N.shared.content_type.FORUM_POST,
        value: env.params.value === 1 ? 1 : -1,
        hb: env.user_info.hb
      },
      { upsert: true });
  });


  // Update post
  //
  N.wire.after(apiPath, async function update_post(env) {
    let result = await N.models.users.Vote.aggregate([
      { $match: { for: env.data.post._id } },
      {
        $group: {
          _id: null,
          votes: { $sum: { $cond: { if: '$hb', then: 0, else: '$value' } } },
          votes_hb: { $sum: '$value' }
        }
      },
      { $project: { _id: false, votes: true, votes_hb: true } }
    ]).exec();

    await N.models.forum.Post.updateOne({ _id: env.data.post._id }, result[0] || { votes: 0, votes_hb: 0 });
  });


  // Create auto report after too many downvotes
  //
  N.wire.after(apiPath, async function auto_report(env) {
    // only run this code when user downvotes
    if (env.params.value >= 0) return;

    let votes_auto_report = await env.extras.settings.fetch('votes_auto_report');

    if (votes_auto_report <= 0) return;

    let downvote_count = await N.models.users.Vote
                                   .where('for').equals(env.data.post._id)
                                   .where('value').lt(0)
                                   .where('hb').ne(true)
                                   .countDocuments();

    if (downvote_count < votes_auto_report) return;

    // check if report already exists
    let exists = await N.models.core.AbuseReport.findOne()
                           .where('src').equals(env.data.post._id)
                           .where('type').equals(N.shared.content_type.FORUM_POST)
                           .where('auto_reported').equals(true)
                           .select('_id')
                           .lean(true);

    if (exists) return;

    let bot = await N.models.users.User.findOne()
                        .where('hid').equals(N.config.bots.default_bot_hid)
                        .select('_id')
                        .lean(true);

    let params = await N.models.core.MessageParams.getParams(env.data.post.params_ref);

    // enable markup used in templates (even if it's disabled in forum)
    params.link  = true;
    params.quote = true;

    let report = new N.models.core.AbuseReport({
      src: env.data.post._id,
      type: N.shared.content_type.FORUM_POST,
      text: env.t('auto_abuse_report_text'),
      from: bot._id,
      auto_reported: true,
      params_ref: await N.models.core.MessageParams.setParams(params)
    });

    await N.wire.emit('internal:common.abuse_report', { report });
  });


  // Mark user as active
  //
  N.wire.after(apiPath, async function set_active_flag(env) {
    await N.wire.emit('internal:users.mark_user_active', env);
  });
};
