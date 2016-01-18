// Check draft attachments exists
//
// params:
// - media_ids - array of media_id to check
//
// result - array of existing media_id
//

'use strict';

var _ = require('lodash');

module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    media_ids: {
      type: 'array',
      required: true,
      uniqueItems: true,
      items: { format: 'mongo' }
    }
  });


  N.wire.on(apiPath, function attachments_check(env, callback) {
    N.models.users.MediaInfo
        .find({
          media_id: { $in: env.params.media_ids },
          user_id: env.user_info.user_id,
          type: { $in: N.models.users.MediaInfo.types.LIST_VISIBLE }
        })
        .lean(true)
        .select('media_id')
        .exec(function (err, res) {

      if (err) {
        callback(err);
        return;
      }

      env.res.media_ids = _.map(res, 'media_id');
      callback();
    });
  });
};
