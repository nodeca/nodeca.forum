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
    },
    reason: { type: 'string' },
    method: { type: 'string', 'enum': [ 'hard', 'soft' ], required: true }
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

    // Check moderator permissions
    let settings = yield env.extras.settings.fetch([
      'forum_mod_can_delete_topics',
      'forum_mod_can_hard_delete_topics'
    ]);

    if (!settings.forum_mod_can_delete_topics && env.params.method === 'soft') {
      throw N.io.FORBIDDEN;
    }

    if (!settings.forum_mod_can_hard_delete_topics && env.params.method === 'hard') {
      throw N.io.FORBIDDEN;
    }
  });


  // Fetch topics
  //
  N.wire.before(apiPath, function* fetch_topics(env) {
    env.data.topics = yield N.models.forum.Topic.find()
                                .where('hid').in(env.params.topics_hids)
                                .where('section').equals(env.data.section._id)
                                .where('st').in(N.models.forum.Topic.statuses.LIST_DELETABLE)
                                .select('_id st ste')
                                .lean(true);

    if (!env.data.topics.length) throw { code: N.io.CLIENT_ERROR, message: env.t('err_no_topics') };
  });


  // Remove topics
  //
  N.wire.on(apiPath, function* delete_topics(env) {
    let statuses = N.models.forum.Topic.statuses;
    let bulk = N.models.forum.Topic.collection.initializeUnorderedBulkOp();

    env.data.topics.forEach(topic => {
      let setData = {
        st: env.params.method === 'hard' ? statuses.DELETED_HARD : statuses.DELETED,
        prev_st: _.pick(topic, [ 'st', 'ste' ]),
        del_by: env.user_info.user_id
      };

      if (env.params.reason) setData.del_reason = env.params.reason;

      bulk.find({ _id: topic._id }).updateOne({
        $set: setData,
        $unset: { ste: 1 }
      });
    });

    yield bulk.execute();
  });


  // Remove votes
  //
  N.wire.after(apiPath, function* remove_votes(env) {
    let statuses = N.models.forum.Post.statuses;

    // IDs list can be very large for big topics, but this should work
    let posts = yield N.models.forum.Post.find()
                          .where('topic').in(_.map(env.data.topics, '_id'))
                          .where('st').in([ statuses.VISIBLE, statuses.HB ])
                          .select('_id')
                          .lean(true);

    yield N.models.users.Vote.collection.update(
      { 'for': { $in: _.map(posts, '_id') } },
      // Just move vote `value` field to `backup` field
      { $rename: { value: 'backup' } },
      { multi: true }
    );
  });


  // Update section counters
  //
  N.wire.after(apiPath, function* update_section(env) {
    yield N.models.forum.Section.updateCache(env.data.section._id);
  });

  // TODO: log moderator actions
};
