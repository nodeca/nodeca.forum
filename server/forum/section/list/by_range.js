// Get a number of topics before or after a topic with a selected last post id
//
'use strict';

// Max topics to fetch before and after
var LIMIT = 50;

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid: {
      type: 'integer',
      required: true
    },
    last_post_id: {
      format: 'mongo',
      required: true
    },
    before: {
      type: 'integer',
      minimum: 0,
      maximum: LIMIT,
      required: true
    },
    after: {
      type: 'integer',
      minimum: 0,
      maximum: LIMIT,
      required: true
    }
  });

  var buildTopicIds = require('./_build_topics_ids_by_range.js')(N);

  // Subcall forum.topic_list
  //
  N.wire.on(apiPath, function subcall_topic_list(env, callback) {
    env.data.section_hid = env.params.section_hid;
    env.data.build_topics_ids = buildTopicIds;

    N.wire.emit('internal:forum.topic_list', env, callback);
  });
};
