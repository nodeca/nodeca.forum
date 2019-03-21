// Sanitize statuses and fields for topics
//
// - N
// - topics - array of models.forum.Topic. Could be plain value
// - user_info - Object with `usergroups` array and `hb`
// - callback - `function (err, res)`
//   - res - array of sanitized items. If `topics` is not array - will be plain sanitized topic
//
'use strict';


const _ = require('lodash');


const fields = [
  '_id',
  'hid',
  'title',
  'views_count',
  'last_post_counter',
  'cache',
  'cache_hb',
  'edit_count',
  'last_edit_ts',
  'st',
  'ste',
  'del_reason',
  'del_by',
  'section'
];


module.exports = async function (N, topics, user_info) {
  let res;

  if (!Array.isArray(topics)) {
    res = [ topics ];
  } else {
    res = topics.slice();
  }

  res = res.map(item => _.pick(item, fields));

  let params = {
    user_id: user_info.user_id,
    usergroup_ids: user_info.usergroups
  };

  let { can_see_hellbanned, can_see_history } = await N.settings.get(
    [ 'can_see_hellbanned', 'can_see_history' ],
    params, {}
  );

  res = res.map(item => {
    if (item.st === N.models.forum.Topic.statuses.HB && !can_see_hellbanned) {
      item.st = item.ste;
      delete item.ste;
    }

    if (item.cache_hb && (user_info.hb || can_see_hellbanned)) {
      item.cache = item.cache_hb;
    }
    delete item.cache_hb;

    if (!can_see_history) {
      delete item.edit_count;
      delete item.last_edit_ts;
    }

    return item;
  });

  if (Array.isArray(topics)) return res;

  return res[0];
};

module.exports.fields = fields;
