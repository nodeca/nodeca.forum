// Save content position
//
// Message data:
//
// - content_id
// - position
//
'use strict';


var validate = require('is-my-json-valid')({
  properties: {
    content_id:  /^[0-9a-f]{24}$/,
    category_id: /^[0-9a-f]{24}$/,
    position:    { type: 'integer', required: true },
    max:         { type: 'integer', required: true }
  },
  additionalProperties: false
});


module.exports = function (N) {
  N.wire.on('internal.live.post:private.forum.marker_set_pos', function* set_scroll_position(data) {
    if (!validate(data.message.data)) throw N.io.BAD_REQUEST;

    data.allowed = true;
    let session = yield data.getSession();

    if (!session.user_id) return;

    yield N.models.users.Marker.setPos(
      session.user_id,
      data.message.data.content_id,
      data.message.data.position,
      data.message.data.max,
      data.message.data.category_id,
      'forum_topic'
    );
  });
};
