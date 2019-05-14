// Get user activity counters for forum posts
//
// Params:
//  - data.user_id (ObjectId)
//  - data.current_user_id (Object), same as env.user_info
//
// Returns:
//  - data.count (Number)
//

'use strict';


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, { parallel: true }, async function activity_get_forum(data) {
    let count = await N.models.forum.UserPostCount.get(data.user_id, data.current_user_info);

    if (Array.isArray(data.count)) {
      data.count = data.count.map((c, i) => c + count[i]);
    } else {
      data.count += count;
    }
  });
};
