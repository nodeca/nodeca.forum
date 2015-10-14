// Add forum types to subscription model
//
'use strict';

module.exports = function (N) {
  N.wire.before('init:models.users.Subscription', function subscription_add_to_types(schema) {
    schema.statics.to_types.FORUM_TOPIC = 1;
    schema.statics.to_types.FORUM_SECTION = 2;
  });
};
