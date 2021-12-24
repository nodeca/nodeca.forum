// Add gc handler to `N.models.users.Marker`
//
'use strict';


const ObjectId  = require('mongoose').Types.ObjectId;
const userInfo  = require('nodeca.users/lib/user_info');


module.exports = function (N) {

  async function forum_topic_gc_handler(userId, contentId, categoryId, max, currentCut) {

    // Fetch user_info
    //
    let user_info = await userInfo(N, userId);

    // Skip gc on scroll if topic end is not reached (to improve performance)
    //
    let can_see_hellbanned = await N.settings.get('can_see_hellbanned', {
      user_id: user_info.user_id,
      usergroup_ids: user_info.usergroups
    }, {});

    let cache = (user_info.hb || can_see_hellbanned) ? 'cache_hb' : 'cache';

    let topic = await N.models.forum.Topic.findById(contentId).lean(true);

    // only run GC if last post is new
    if (topic[cache].last_ts < currentCut) return [];

    // only run GC if triggered when last post is fully visible
    if (max < topic[cache].last_post_hid) return [];

    // Fetch topics
    //
    let topics = await N.models.forum.Topic.find()
                           .where('section').equals(categoryId)
                           .where(cache + '.last_post').gt(new ObjectId(Math.round(currentCut / 1000)))
                           .lean(true);

    // Check access
    //
    let access_env = { params: { topics, user_info } };

    await N.wire.emit('internal:forum.access.topic', access_env);

    topics = topics.filter((__, i) => access_env.data.access_read[i]);

    return topics.map(topic => ({
      categoryId: topic.section,
      contentId: topic._id,
      lastPostNumber: topic.last_post_counter,
      lastPostTs: topic[cache].last_ts
    }));
  }


  N.wire.after('init:models', { priority: 50 }, function marker_add_gc_handler() {
    N.models.users.Marker.registerGc('forum_topic', forum_topic_gc_handler);
  });
};
