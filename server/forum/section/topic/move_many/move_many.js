// Move topics
//
'use strict';


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
  N.wire.before(apiPath, function* fetch_sections(env) {
    env.data.section_from = yield N.models.forum.Section.findOne({ hid: env.params.section_hid_from }).lean(true);
    if (!env.data.section_from) throw N.io.NOT_FOUND;

    env.data.section_to = yield N.models.forum.Section.findOne({ hid: env.params.section_hid_to }).lean(true);
    if (!env.data.section_to) throw N.io.NOT_FOUND;

    // Can not move to category. Should never happens - restricted on client
    if (env.data.section_to.is_category) throw N.io.BAD_REQUEST;
  });


  // Check if user has an access to this section
  //
  N.wire.before(apiPath, function* check_access(env) {
    let access_env = { params: { sections: [ env.data.section_from, env.data.section_to ], user_info: env.user_info } };

    yield N.wire.emit('internal:forum.access.section', access_env);

    access_env.data.access_read.forEach(access => {
      if (!access) throw N.io.NOT_FOUND;
    });
  });


  // Check permission to delete topic from source section
  //
  N.wire.before(apiPath, function* check_permissions(env) {
    env.extras.settings.params.section_id = env.data.section_from._id;

    let forum_mod_can_delete_topics = yield env.extras.settings.fetch('forum_mod_can_delete_topics');

    if (!forum_mod_can_delete_topics) throw N.io.FORBIDDEN;
  });


  // Fetch topics
  //
  N.wire.before(apiPath, function* fetch_topics(env) {
    env.data.topics = yield N.models.forum.Topic.find()
                                .where('hid').in(env.params.topics_hids)
                                .where('section').equals(env.data.section_from._id)
                                .select('_id')
                                .lean(true);

    if (!env.data.topics.length) throw N.io.NOT_FOUND;
  });


  // Move topics
  //
  N.wire.on(apiPath, function* move_topics(env) {
    let bulk = N.models.forum.Topic.collection.initializeUnorderedBulkOp();

    env.data.topics.forEach(topic => {
      bulk.find({ _id: topic._id }).updateOne({
        $set: { section: env.data.section_to._id }
      });
    });

    yield bulk.execute();
  });


  // Update sections counters
  //
  N.wire.after(apiPath, function* update_sections(env) {
    yield N.models.forum.Section.updateCache(env.data.section_from._id);
    yield N.models.forum.Section.updateCache(env.data.section_to._id);
  });

  // TODO: log moderator actions
};
