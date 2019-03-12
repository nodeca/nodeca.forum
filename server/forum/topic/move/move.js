// Move topics
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid_from: { type: 'integer', required: true },
    section_hid_to:   { type: 'integer', required: true },
    topic_hid:        { type: 'integer', required: true }
  });


  // Fetch sections
  //
  N.wire.before(apiPath, async function fetch_sections(env) {
    env.data.section_from = await N.models.forum.Section.findOne({ hid: env.params.section_hid_from }).lean(true);
    if (!env.data.section_from) throw N.io.NOT_FOUND;

    env.data.section_to = await N.models.forum.Section.findOne({ hid: env.params.section_hid_to }).lean(true);
    if (!env.data.section_to) throw N.io.NOT_FOUND;

    // Can not move to category. Should never happens - restricted on client
    if (env.data.section_to.is_category) throw N.io.BAD_REQUEST;
  });


  // Fetch topic
  //
  N.wire.before(apiPath, async function fetch_topic(env) {
    env.data.topic = await N.models.forum.Topic
                              .findOne({ hid: env.params.topic_hid })
                              .lean(true);

    if (!env.data.topic) throw N.io.NOT_FOUND;
  });


  // Check if user has an access to topic
  //
  N.wire.before(apiPath, async function check_topic_access(env) {
    let access_env = { params: {
      topics: env.data.topic,
      user_info: env.user_info,
      preload: [ env.data.section_from ]
    } };

    await N.wire.emit('internal:forum.access.topic', access_env);

    if (!access_env.data.access_read) throw N.io.FORBIDDEN;
  });


  // Check if user has an access to target section
  //
  N.wire.before(apiPath, async function check_target_section_access(env) {
    let access_env = { params: { sections: env.data.section_to, user_info: env.user_info } };

    await N.wire.emit('internal:forum.access.section', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Check permission to delete topic from source section
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    env.extras.settings.params.section_id = env.data.section_from._id;

    let forum_mod_can_delete_topics = await env.extras.settings.fetch('forum_mod_can_delete_topics');

    if (!forum_mod_can_delete_topics) throw N.io.FORBIDDEN;
  });


  // Update section for all posts in moved topic
  //
  N.wire.on(apiPath, async function update_section(env) {
    await N.models.forum.Post.updateMany(
      { topic: env.data.topic._id },
      { $set: { section: env.data.section_to._id } }
    );
  });


  // Move topic
  //
  N.wire.on(apiPath, async function move_topic(env) {
    env.data.new_topic = await N.models.forum.Topic.findOneAndUpdate(
      { _id: env.data.topic._id },
      { $set: { section: env.data.section_to._id } },
      { 'new': true }
    );
  });


  // Save old version in history
  //
  N.wire.after(apiPath, function save_history(env) {
    return N.models.forum.TopicHistory.add(
      {
        old_topic: env.data.topic,
        new_topic: env.data.new_topic
      },
      {
        user: env.user_info.user_id,
        role: N.models.forum.TopicHistory.roles.MODERATOR,
        ip:   env.req.ip
      }
    );
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function add_search_index(env) {
    await N.queue.forum_topics_search_update_with_posts([ env.data.topic._id ]).postpone();
  });


  // Update sections counters
  //
  N.wire.after(apiPath, async function update_sections(env) {
    await N.models.forum.Section.updateCache(env.data.section_from._id);
    await N.models.forum.Section.updateCache(env.data.section_to._id);
  });
};
