// TODO: move this to nodeca.forum/server/topic/offset/offset.js + refactor

// Get a topic with given id + its position in a section
//
'use strict';


var _     = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid: {
      type: 'integer',
      required: true
    },
    topic_id: {
      format: 'mongo',
      required: true
    }
  });


  function buildTopicIds(env, callback) {
    var Topic = N.models.forum.Topic;
    var cache_key = env.user_info.hb ? 'cache_hb' : 'cache';

    env.extras.settings.fetch('topics_per_page', function (err, topics_per_page) {
      if (err) {
        callback(err);
        return;
      }

      Topic.findById(env.params.topic_id, function (err, topic) {
        if (err) {
          callback(err);
          return;
        }

        env.res.topic_offset = 0;
        env.res.topics_per_page = topics_per_page;
        env.data.topics_ids = [];

        // Move to the first page (i.e. return zero offset) if:
        //  - topic does not exist
        //  - topic was moved to a different section
        //  - topic is pinned, so it's always in the first page
        //
        if (!topic || String(topic.section) !== String(env.data.section._id) || topic.st === Topic.statuses.PINNED) {
          callback();
          return;
        }

        var sort = {};
        sort[cache_key + '.last_post'] = -1;

        Topic.find()
            .where('section').equals(env.data.section._id)
            .where(cache_key + '.last_post').gt(topic[cache_key].last_post)
            .where('st').in(_.without(env.data.topics_visible_statuses, Topic.statuses.PINNED))
            .sort(sort)
            .count(function (err, topics) {

          if (err) {
            callback(err);
            return;
          }

          env.res.topic_offset = topics;
          env.data.topics_ids = [ env.params.topic_id ];
          callback();
        });
      });
    });
  }


  // Subcall forum.topic_list
  //
  N.wire.on(apiPath, function subcall_topic_list(env, callback) {
    env.data.section_hid = env.params.section_hid;
    env.data.build_topics_ids = buildTopicIds;

    N.wire.emit('internal:forum.topic_list', env, callback);
  });
};
