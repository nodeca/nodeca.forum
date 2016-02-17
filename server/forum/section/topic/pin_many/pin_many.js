// Pin topics
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid: { type: 'integer', required: true },
    topics_hids: {
      type: 'array',
      required: true,
      uniqueItems: true,
      items: { type: 'integer', required: true }
    }
  });


  // Fetch section
  //
  N.wire.before(apiPath, function* fetch_topic(env) {
    env.data.section = yield N.models.forum.Section.findOne({ hid: env.params.section_hid }).lean(true);
    if (!env.data.section) throw N.io.NOT_FOUND;
  });


  // Check if user has an access to this section
  //
  N.wire.before(apiPath, function* check_access(env) {
    let access_env = { params: { sections: env.data.section, user_info: env.user_info } };

    yield N.wire.emit('internal:forum.access.section', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Check permissions
  //
  N.wire.before(apiPath, function* check_permissions(env) {
    env.extras.settings.params.section_id = env.data.section._id;

    let forum_mod_can_pin_topic = yield env.extras.settings.fetch('forum_mod_can_pin_topic');

    if (!forum_mod_can_pin_topic) {
      throw N.io.FORBIDDEN;
    }
  });


  // Fetch topics
  //
  N.wire.before(apiPath, function* fetch_topics(env) {
    env.data.topics = yield N.models.forum.Topic.find()
              .where('hid').in(env.params.topics_hids)
              .where('section').equals(env.data.section._id)
              .where('st').in(N.models.forum.Topic.statuses.LIST_VISIBLE)
              .select('_id st')
              .lean(true);

    if (!env.data.topics.length) throw { code: N.io.CLIENT_ERROR, message: env.t('err_no_topics') };
  });


  // Pin topics
  //
  N.wire.on(apiPath, function* pin_topics(env) {
    let statuses = N.models.forum.Topic.statuses;
    let bulk = N.models.forum.Topic.collection.initializeUnorderedBulkOp();

    env.data.topics.forEach(topic => {
      bulk.find({ _id: topic._id }).updateOne({
        $set: { st: statuses.PINNED, ste: topic.st }
      });
    });

    yield bulk.execute();
  });

  // TODO: log moderator actions
};
