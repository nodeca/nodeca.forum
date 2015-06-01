// Helpers to manage section cache
//


'use strict';


var _ = require('lodash');


module.exports = function (N) {

  var updateCache = {};

  // Re-calculate section cache for the specified section and its parents
  // from scratch.
  //
  // Used when the section cache is no longer relevant (e.g. when post
  // is deleted).
  //
  updateCache.full = function (sectionID, callback) {
    var Section = N.models.forum.Section;
    var Topic = N.models.forum.Topic;

    // Get all subsections of the current section and return the last post
    // from those
    //
    function fill_cache_from_subsections(callback) {
      var result = { cache: {}, cache_hb: {} };

      Section.getChildren(sectionID, 1, function (err, children) {
        if (err) {
          callback(err);
          return;
        }

        if (!children.length) {
          callback(null, result);
          return;
        }

        Section.find({
          _id: { $in: _.pluck(children, '_id') }
        }, function (err, sections) {

          if (err) {
            callback(err);
            return;
          }

          // Pick the latest post (post with highest _id) out of all those
          // subsection caches.
          //
          sections.forEach(function (section) {
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

          callback(null, result);
        });
      });
    }

    // Get the latest topic from current section
    //
    function fill_cache_from_own_topics(callback) {
      var result = { cache: {}, cache_hb: {} };

      var visible_st_hb = [
        Topic.statuses.OPEN,
        Topic.statuses.CLOSED,
        Topic.statuses.PINNED,
        Topic.statuses.HB
      ];

      Topic
          .findOne({ section: sectionID, st: { $in: visible_st_hb } })
          .sort('-cache_hb.last_post')
          .exec(function (err, topic) {

        if (err) {
          callback(err);
          return;
        }

        if (!topic) {
          // all topics in this section are deleted
          callback(null, result);
          return;
        }

        // Last post in this section is considered hellbanned if
        //  (whole topic has HB status) OR (last post has HB status)
        //
        // Last post in the topic is hellbanned iff topic.cache differs from topic.cache_hb
        //
        var last_post_hb = (topic.st === Topic.statuses.HB) ||
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
          callback(null, result);
          return;
        }

        var visible_st = [
          Topic.statuses.OPEN,
          Topic.statuses.CLOSED,
          Topic.statuses.PINNED
        ];


        Topic
            .findOne({ section: sectionID, st: { $in: visible_st } })
            .sort('-cache.last_post')
            .exec(function (err, topic) {

          if (err) {
            callback(err);
            return;
          }

          if (!topic) {
            // all visible topics in this section are deleted
            callback(null, result);
            return;
          }

          result.cache_hb = {
            last_topic:       topic._id,
            last_topic_hid:   topic.hid,
            last_topic_title: topic.title,
            last_post:        topic.cache.last_post,
            last_user:        topic.cache.last_user,
            last_ts:          topic.cache.last_ts
          };

          callback(null, result);
        });
      });
    }


    fill_cache_from_subsections(function (err, data1) {
      if (err) {
        callback(err);
        return;
      }

      fill_cache_from_own_topics(function (err, data2) {
        if (err) {
          callback(err);
          return;
        }

        var source;
        var updateData = {};

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

        Section.update({ _id: sectionID }, updateData, function (err) {
          if (err) {
            callback(err);
            return;
          }

          Section.getParentList(sectionID, function (err, list) {
            if (err) {
              callback(err);
              return;
            }

            if (list.length) {
              updateCache.full(list.pop(), callback);
            } else {
              callback();
            }
          });
        });
      });
    });
  };


  // Set section cache to the last topic in this section and all the parent
  // sections.
  //
  // Used when a new post in the section is created.
  //
  updateCache.simple = function (sectionID, callback) {
    var Section = N.models.forum.Section;
    var Topic = N.models.forum.Topic;
    var updateData = {};

    var visible_st_hb = [
      Topic.statuses.OPEN,
      Topic.statuses.CLOSED,
      Topic.statuses.PINNED,
      Topic.statuses.HB
    ];

    Topic
        .findOne({ section: sectionID, st: { $in: visible_st_hb } })
        .sort('-cache_hb.last_post')
        .exec(function (err, topic) {

      if (err) {
        callback(err);
        return;
      }

      if (!topic) {
        // all topics in this section are deleted
        callback();
        return;
      }

      // Last post in this section is considered hellbanned if
      //  (whole topic has HB status) OR (last post has HB status)
      //
      // Last post in the topic is hellbanned iff topic.cache differs from topic.cache_hb
      //
      var last_post_hb = (topic.st === Topic.statuses.HB) ||
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

      Section.getParentList(sectionID, function (err, parents) {
        if (err) {
          callback(err);
          return;
        }

        Section.update(
          { _id: { $in: parents.concat([ sectionID ]) } },
          { $set: updateData },
          { multi: true },
          callback
        );
      });
    });
  };

  return updateCache;
};
