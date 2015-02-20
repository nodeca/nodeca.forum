// Fetch topics list from ajax, to "append next page"
'use strict';

module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    // section hid
    hid: {
      type: 'integer',
      minimum: 1,
      required: true
    },
    page: {
      type: 'integer',
      minimum: 1,
      'default': 1
    }
  });


  // Subcall forum.topic_list
  //
  N.wire.on(apiPath, function subcall_topic_list(env, callback) {
    N.wire.emit('internal:forum.topic_list', env, callback);
  });
};
