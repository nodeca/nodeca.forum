// Add gc handler to `N.models.users.Marker`
//
'use strict';


const ObjectId       = require('mongoose').Types.ObjectId;
const userInfo       = require('nodeca.users/lib/user_info');
const sanitize_topic = require('nodeca.forum/lib/sanitizers/topic');


module.exports = function (N) {

  async function forum_topic_gc_handler(userId, categoryId, currentCut) {
    // Fetch user_info
    //
    let user_info = await userInfo(N, userId);

    // Fetch topics
    //
    let query = N.models.forum.Topic
                    .find()
                    .where('section')
                    .equals(categoryId);

    if (user_info.hb) {
      query.where('cache_hb.last_post');
    } else {
      query.where('cache.last_post');
    }

    query.gt(new ObjectId(Math.round(currentCut / 1000)));

    let topics = await query.lean(true);

    // Check access
    //
    let access_env = { params: { topics, user_info } };

    await N.wire.emit('internal:forum.access.topic', access_env);

    topics = topics.filter((__, i) => access_env.data.access_read[i]);

    // Sanitize
    //
    topics = await sanitize_topic(N, topics, user_info);


    return topics.map(topic => ({
      categoryId: topic.section,
      contentId: topic._id,
      lastPostNumber: topic.last_post_counter,
      lastPostTs: topic.cache.last_ts
    }));
  }


  N.wire.after('init:models', { priority: 50 }, function marker_add_gc_handler() {
    N.models.users.Marker.registerGc('forum_topic', forum_topic_gc_handler);
  });
};
