// Remove many topics by hid
//
'use strict';


const _ = require('lodash');


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


  // Fetch topics & check permissions
  //
  N.wire.before(apiPath, async function fetch_topics(env) {
    env.extras.settings.params.section_id = env.data.section._id;

    // Fetch moderator permissions
    let settings = await env.extras.settings.fetch([
      'forum_mod_can_delete_topics',
      'forum_mod_can_hard_delete_topics'
    ]);

    let st = [];

    if (settings.forum_mod_can_delete_topics) {
      st.push(N.models.forum.Topic.statuses.DELETED);
    }

    if (settings.forum_mod_can_hard_delete_topics) {
      st.push(N.models.forum.Topic.statuses.DELETED_HARD);
    }

    if (!st.length) {
      throw N.io.FORBIDDEN;
    }

    env.data.topics = await N.models.forum.Topic.find()
                                .where('hid').in(env.params.topics_hids)
                                .where('section').equals(env.data.section._id)
                                .where('st').in(st)
                                .select('_id prev_st')
                                .lean(true);

    if (!env.data.topics.length) throw { code: N.io.CLIENT_ERROR, message: env.t('err_no_topics') };
  });


  // Undelete topics
  //
  N.wire.on(apiPath, async function undelete_topics(env) {
    let bulk = N.models.forum.Topic.collection.initializeUnorderedBulkOp();

    env.data.topics.forEach(topic => {
      bulk.find({ _id: topic._id }).updateOne({
        $set: topic.prev_st,
        $unset: { del_reason: 1, prev_st: 1, del_by: 1 }
      });
    });

    await bulk.execute();
  });


  // Restore votes
  //
  N.wire.after(apiPath, async function remove_votes(env) {
    let statuses = N.models.forum.Post.statuses;

    // IDs list can be very large for big topics, but this should work
    let posts = await N.models.forum.Post.find()
                          .where('topic').in(_.map(env.data.topics, '_id'))
                          .where('st').in([ statuses.VISIBLE, statuses.HB ])
                          .select('_id')
                          .lean(true);

    await N.models.users.Vote.collection.update(
      { 'for': { $in: _.map(posts, '_id') } },
      // Just move vote `backup` field back to `value` field
      { $rename: { backup: 'value' } },
      { multi: true }
    );
  });


  // Update section counters
  //
  N.wire.after(apiPath, async function update_section(env) {
    await N.models.forum.Section.updateCache(env.data.section._id);
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function add_search_index(env) {
    await N.queue.forum_topics_search_update_with_posts(env.data.topics.map(t => t._id)).postpone();
  });

  // TODO: log moderator actions
};
