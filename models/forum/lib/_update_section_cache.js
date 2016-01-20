// Helpers to manage section cache
//
'use strict';


const _  = require('lodash');
const co = require('co');


module.exports = function (N) {

  let updateCache = {};

  // Re-calculate section cache for the specified section and its parents
  // from scratch.
  //
  // Used when the section cache is no longer relevant (e.g. when post
  // is deleted).
  //
  updateCache.full = co.wrap(function* (sectionID) {
    let Section = N.models.forum.Section;
    let Topic = N.models.forum.Topic;

    // Get all subsections of the current section and return the last post
    // from those
    //
    let fill_cache_from_subsections = co.wrap(function* () {
      let result = { cache: {}, cache_hb: {} };
      let children = yield Section.getChildren(sectionID, 1);

      if (!children.length) {
        return result;
      }

      let sections = yield Section.find({ _id: { $in: _.map(children, '_id') } });

      // Pick the latest post (post with highest _id) out of all those
      // subsection caches.
      //
      sections.forEach(section => {
        if (section.cache.last_post) {
          if (!result.cache.last_post || result.cache.last_post < section.cache.last_post) {
            result.cache = section.cache;
          }
        }

        if (section.cache_hb.last_post) {
          if (!result.cache_hb.last_post || result.cache_hb.last_post < section.cache_hb.last_post) {
            result.cache_hb = section.cache_hb;
          }
        }
      });

      return result;
    });

    // Get the latest topic from current section
    //
    let fill_cache_from_own_topics = co.wrap(function* () {
      let result = { cache: {}, cache_hb: {} };
      let visible_st_hb = [ Topic.statuses.HB ].concat(Topic.statuses.LIST_VISIBLE);
      let topic = yield Topic.findOne({ section: sectionID, st: { $in: visible_st_hb } })
        .sort('-cache_hb.last_post');

      if (!topic) {
        // all topics in this section are deleted
        return result;
      }

      // Last post in this section is considered hellbanned if
      //  (whole topic has HB status) OR (last post has HB status)
      //
      // Last post in the topic is hellbanned iff topic.cache differs from topic.cache_hb
      //
      let last_post_hb = (topic.st === Topic.statuses.HB) ||
        (String(topic.cache.last_post) !== String(topic.cache_hb.last_post));

      result.cache_hb = {
        last_topic:       topic._id,
        last_topic_hid:   topic.hid,
        last_topic_title: topic.title,
        last_post:        topic.cache_hb.last_post,
        last_user:        topic.cache_hb.last_user,
        last_ts:          topic.cache_hb.last_ts
      };

      if (!last_post_hb) {
        // If the last post in this section is not hellbanned, it is seen as
        // such for both hb and non-hb users. Thus, cache is the same for both.
        //
        result.cache = result.cache_hb;
        return result;
      }

      topic = yield Topic.findOne({ section: sectionID, st: { $in: Topic.statuses.LIST_VISIBLE } })
        .sort('-cache.last_post');

      if (!topic) {
        // all visible topics in this section are deleted
        return result;
      }

      result.cache_hb = {
        last_topic:       topic._id,
        last_topic_hid:   topic.hid,
        last_topic_title: topic.title,
        last_post:        topic.cache.last_post,
        last_user:        topic.cache.last_user,
        last_ts:          topic.cache.last_ts
      };

      return result;
    });

    let data1 = yield fill_cache_from_subsections();
    let data2 = yield fill_cache_from_own_topics();
    let source;
    let updateData = {};

    source = (!data2.cache.last_post || data1.cache.last_post > data2.cache.last_post ? data1 : data2);

    updateData['cache.last_topic']       = source.cache.last_topic || null;
    updateData['cache.last_topic_hid']   = source.cache.last_topic_hid || null;
    updateData['cache.last_topic_title'] = source.cache.last_topic_title || null;
    updateData['cache.last_post']        = source.cache.last_post || null;
    updateData['cache.last_user']        = source.cache.last_user || null;
    updateData['cache.last_ts']          = source.cache.last_ts || null;

    source = (!data2.cache_hb.last_post || data1.cache_hb.last_post > data2.cache_hb.last_post ? data1 : data2);

    updateData['cache_hb.last_topic']       = source.cache_hb.last_topic || null;
    updateData['cache_hb.last_topic_hid']   = source.cache_hb.last_topic_hid || null;
    updateData['cache_hb.last_topic_title'] = source.cache_hb.last_topic_title || null;
    updateData['cache_hb.last_post']        = source.cache_hb.last_post || null;
    updateData['cache_hb.last_user']        = source.cache_hb.last_user || null;
    updateData['cache_hb.last_ts']          = source.cache_hb.last_ts || null;

    yield Section.update({ _id: sectionID }, updateData);

    let list = yield Section.getParentList(sectionID);

    if (list.length) {
      yield updateCache.full(list.pop());
    }
  });


  // Set section cache to the last topic in this section and all the parent
  // sections.
  //
  // Used when a new post in the section is created.
  //
  updateCache.simple = co.wrap(function* (sectionID) {
    let Section = N.models.forum.Section;
    let Topic = N.models.forum.Topic;
    let updateData = {};

    let visible_st_hb = [
      Topic.statuses.OPEN,
      Topic.statuses.CLOSED,
      Topic.statuses.PINNED,
      Topic.statuses.HB
    ];

    let topic = yield Topic
      .findOne({ section: sectionID, st: { $in: visible_st_hb } })
      .sort('-cache_hb.last_post');

    if (!topic) {
      // all topics in this section are deleted
      return;
    }

    // Last post in this section is considered hellbanned if
    //  (whole topic has HB status) OR (last post has HB status)
    //
    // Last post in the topic is hellbanned iff topic.cache differs from topic.cache_hb
    //
    let last_post_hb = (topic.st === Topic.statuses.HB) ||
      (String(topic.cache.last_post) !== String(topic.cache_hb.last_post));

    if (!last_post_hb) {
      // If the last post in this section is not hellbanned, it is seen as
      // such for both hb and non-hb users. Thus, cache is the same for both.
      //
      updateData['cache.last_topic']       = topic._id;
      updateData['cache.last_topic_hid']   = topic.hid;
      updateData['cache.last_topic_title'] = topic.title;
      updateData['cache.last_post']        = topic.cache_hb.last_post;
      updateData['cache.last_user']        = topic.cache_hb.last_user;
      updateData['cache.last_ts']          = topic.cache_hb.last_ts;
    }

    updateData['cache_hb.last_topic']       = topic._id;
    updateData['cache_hb.last_topic_hid']   = topic.hid;
    updateData['cache_hb.last_topic_title'] = topic.title;
    updateData['cache_hb.last_post']        = topic.cache_hb.last_post;
    updateData['cache_hb.last_user']        = topic.cache_hb.last_user;
    updateData['cache_hb.last_ts']          = topic.cache_hb.last_ts;

    let parents = yield Section.getParentList(sectionID);

    yield Section.update(
      { _id: { $in: parents.concat([ sectionID ]) } },
      { $set: updateData },
      { multi: true }
    );
  });

  return updateCache;
};
