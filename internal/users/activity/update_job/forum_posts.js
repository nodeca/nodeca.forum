// Recount number of posts in forum sections for a user
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

  N.wire.on(apiPath, async function activity_fetch_forum_posts({ user_id, section_id }) {
    // check that user exists
    let user = await N.models.users.User.findById(user_id).lean(true);
    if (!user) return;

    let counters = await N.models.forum.UserPostCount.findOne()
                             .where('user').equals(user._id)
                             .lean(true);

    if (!counters || !section_id) {
      // full recount for each section
      let value = {};
      let value_hb = {};

      let results = await N.models.forum.Post.aggregate([
        { $match: { user: user._id, st: N.models.forum.Post.statuses.VISIBLE, topic_exists: true } },
        { $group: { _id: '$section', count: { $sum: 1 } } }
      ]);

      for (let { _id, count } of results) {
        value[_id] = count;
        value_hb[_id] = count;
      }

      let results_hb = await N.models.forum.Post.aggregate([
        { $match: { user: user._id, st: N.models.forum.Post.statuses.HB, topic_exists: true } },
        { $group: { _id: '$section', count: { $sum: 1 } } }
      ]);

      for (let { _id, count } of results_hb) {
        value_hb[_id] = (value_hb[_id] || 0) + count;
      }

      await N.models.forum.UserPostCount.replaceOne(
        { user: user._id },
        { user: user._id, value, value_hb },
        { upsert: true }
      );
      return;
    }

    // count single section
    let results = await N.models.forum.Post
                            .where('user').equals(user._id)
                            .where('section').equals(section_id)
                            .where('st').equals(N.models.forum.Post.statuses.VISIBLE)
                            .where('topic_exists').equals(true)
                            .countDocuments();

    let results_hb = await N.models.forum.Post
                               .where('user').equals(user._id)
                               .where('section').equals(section_id)
                               .where('st').equals(N.models.forum.Post.statuses.HB)
                               .where('topic_exists').equals(true)
                               .countDocuments();

    await N.models.forum.UserPostCount.updateOne(
      { user: user._id },
      { $set: {
        [`value.${section_id}`]: results,
        [`value_hb.${section_id}`]: results + results_hb
      } }
    );
  });
};
