// Get topics by page
//
'use strict';

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid: {
      type: 'integer',
      minimum: 1,
      required: true
    },
    page: {
      type: 'integer',
      minimum: 1,
      default: 1
    }
  });

  var buildTopicsIds = require('./_build_topics_ids_by_page.js')(N);

  // Subcall forum.topic_list
  //
  N.wire.on(apiPath, function subcall_topic_list(env, callback) {
    env.data.section_hid = env.params.section_hid;
    env.data.build_topics_ids = buildTopicsIds;

    N.wire.emit('internal:forum.topic_list', env, callback);
  });


  // Fill page info
  //
  N.wire.after(apiPath, function fill_page(env) {
    env.res.page = env.data.page;
  });
};
