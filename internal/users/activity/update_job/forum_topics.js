// Recount number of topics in forum sections for a user
//
// Params:
//  - user_id (ObjectId)
//  - section_id (ObjectId), optional
//
// This internal method is used in `activity_update` task, so recount is
// delayed and performed in the background.
//
// It also may be used whenever we don't need delayed update
// (e.g. in seeds and vbconvert).
//

'use strict';


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, async function activity_fetch_forum_topics({ user_id, section_id }) {
    // check that user exists
    let user = await N.models.users.User.findById(user_id).lean(true);
    if (!user) return;

    let counters = await N.models.forum.UserTopicCount.findOne()
                             .where('user').equals(user._id)
                             .lean(true);

    if (!counters || !section_id) {
      // full recount for each section
      let value = {};
      let value_hb = {};

      let results = await N.models.forum.Topic.aggregate([
        { $match: { 'cache.first_user': user._id, st: { $in: N.models.forum.Topic.statuses.LIST_VISIBLE } } },
        { $group: { _id: '$section', count: { $sum: 1 } } }
      ]);

      for (let { _id, count } of results) {
        value[_id] = count;
        value_hb[_id] = count;
      }

      let results_hb = await N.models.forum.Topic.aggregate([
        { $match: { 'cache.first_user': user._id, st: N.models.forum.Topic.statuses.HB } },
        { $group: { _id: '$section', count: { $sum: 1 } } }
      ]);

      for (let { _id, count } of results_hb) {
        value_hb[_id] = (value_hb[_id] || 0) + count;
      }

      await N.models.forum.UserTopicCount.replaceOne(
        { user: user._id },
        { user: user._id, value, value_hb },
        { upsert: true }
      );
      return;
    }

    // count single section
    let counters_by_status = await Promise.all(
      N.models.forum.Topic.statuses.LIST_VISIBLE.map(st =>
        N.models.forum.Topic
            .where('cache.first_user').equals(user._id)
            .where('section').equals(section_id)
            .where('st').equals(st)
            .countDocuments()
      )
    );

    let results = counters_by_status.reduce((a, b) => a + b, 0);

    let results_hb = await N.models.forum.Topic
                               .where('cache.first_user').equals(user._id)
                               .where('section').equals(section_id)
                               .where('st').equals(N.models.forum.Topic.statuses.HB)
                               .countDocuments();

    await N.models.forum.UserTopicCount.updateOne(
      { user: user._id },
      { $set: {
        [`value.${section_id}`]: results,
        [`value_hb.${section_id}`]: results + results_hb
      } }
    );
  });
};
