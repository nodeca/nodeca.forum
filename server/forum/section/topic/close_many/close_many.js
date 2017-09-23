// Close topics
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
  N.wire.before(apiPath, async function fetch_topic(env) {
    env.data.section = await N.models.forum.Section.findOne({ hid: env.params.section_hid }).lean(true);
    if (!env.data.section) throw N.io.NOT_FOUND;
  });


  // Check if user has an access to this section
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: { sections: env.data.section, user_info: env.user_info } };

    await N.wire.emit('internal:forum.access.section', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    env.extras.settings.params.section_id = env.data.section._id;

    let forum_mod_can_close_topic = await env.extras.settings.fetch('forum_mod_can_close_topic');

    if (!forum_mod_can_close_topic) {
      throw N.io.FORBIDDEN;
    }
  });


  // Fetch topics
  //
  N.wire.before(apiPath, async function fetch_topics(env) {
    env.data.topics = await N.models.forum.Topic.find()
                                .where('hid').in(env.params.topics_hids)
                                .where('section').equals(env.data.section._id)
                                .where('st').in(N.models.forum.Topic.statuses.LIST_CLOSEBLE)
                                .select('_id st')
                                .lean(true);

    if (!env.data.topics.length) throw { code: N.io.CLIENT_ERROR, message: env.t('err_no_topics') };
  });


  // Close topics
  //
  N.wire.on(apiPath, async function close_topics(env) {
    let statuses = N.models.forum.Topic.statuses;
    let bulk = N.models.forum.Topic.collection.initializeUnorderedBulkOp();

    env.data.topics.forEach(topic => {
      let setData = {};

      if (topic.st === statuses.PINNED || topic.st === statuses.HB) {
        setData.ste = statuses.CLOSED;
      } else {
        setData.st = statuses.CLOSED;
      }

      bulk.find({ _id: topic._id }).updateOne({ $set: setData });
    });

    await bulk.execute();
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function add_search_index(env) {
    await N.queue.forum_topics_search_update_with_posts(env.data.topics.map(t => t._id)).postpone();
  });

  // TODO: log moderator actions
};
