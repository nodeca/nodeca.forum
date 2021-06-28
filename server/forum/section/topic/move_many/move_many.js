// Move topics
//
'use strict';


const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid_from: { type: 'integer', required: true },
    section_hid_to:   { type: 'integer', required: true },
    topics_hids: {
      type: 'array',
      required: true,
      uniqueItems: true,
      items: { type: 'integer', required: true }
    }
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


  // Check if user has an access to this section
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: { sections: [ env.data.section_from, env.data.section_to ], user_info: env.user_info } };

    await N.wire.emit('internal:forum.access.section', access_env);

    access_env.data.access_read.forEach(access => {
      if (!access) throw N.io.NOT_FOUND;
    });
  });


  // Check permission to delete topic from source section
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    env.extras.settings.params.section_id = env.data.section_from._id;

    let forum_mod_can_delete_topics = await env.extras.settings.fetch('forum_mod_can_delete_topics');

    if (!forum_mod_can_delete_topics) throw N.io.FORBIDDEN;
  });


  // Fetch topics
  //
  N.wire.before(apiPath, async function fetch_topics(env) {
    env.data.topics = await N.models.forum.Topic.find()
                                .where('hid').in(env.params.topics_hids)
                                .where('section').equals(env.data.section_from._id)
                                .lean(true);

    if (!env.data.topics.length) throw N.io.NOT_FOUND;
  });


  // Move topics
  //
  N.wire.on(apiPath, async function move_topics(env) {
    env.data.changes = [];

    let bulk = N.models.forum.Topic.collection.initializeUnorderedBulkOp();

    env.data.topics.forEach(topic => {
      env.data.changes.push({
        old_topic: topic,
        new_topic: Object.assign({}, topic, { section: env.data.section_to._id })
      });

      bulk.find({ _id: topic._id }).updateOne({
        $set: { section: env.data.section_to._id }
      });
    });

    await bulk.execute();
  });


  // Save old version in history
  //
  N.wire.after(apiPath, function save_history(env) {
    return N.models.forum.TopicHistory.add(
      env.data.changes,
      {
        user: env.user_info.user_id,
        role: N.models.forum.TopicHistory.roles.MODERATOR,
        ip:   env.req.ip
      }
    );
  });


  // Update sections counters
  //
  N.wire.after(apiPath, async function update_sections(env) {
    await N.models.forum.Section.updateCache(env.data.section_from._id);
    await N.models.forum.Section.updateCache(env.data.section_to._id);
  });


  // Update user topic counters
  //
  N.wire.after(apiPath, async function update_user_topics(env) {
    let users = env.data.topics.map(t => t.cache?.first_user);

    users = _.uniq(users.map(String));

    await N.models.forum.UserTopicCount.recount(
      [].concat(users.map(user_id => [ user_id, env.data.section_from._id ]))
        .concat(users.map(user_id => [ user_id, env.data.section_to._id ]))
    );
  });


  // Update user post counters
  //
  N.wire.after(apiPath, async function update_user_topics(env) {
    let users = _.map(
      await N.models.forum.Post.find()
                .where('topic').in(env.data.topics.map(t => t._id))
                .select('user')
                .lean(true),
      'user'
    );

    users = _.uniq(users.map(String));

    await N.models.forum.UserPostCount.recount(
      [].concat(users.map(user_id => [ user_id, env.data.section_from._id ]))
        .concat(users.map(user_id => [ user_id, env.data.section_to._id ]))
    );
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function add_search_index(env) {
    await N.queue.forum_topics_search_update_with_posts(env.data.topics.map(t => t._id)).postpone();
  });
};
