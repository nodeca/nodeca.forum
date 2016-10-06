// Sanitize statuses and fields for sections
//
// - N
// - sections - array of models.forum.Section. Could be plain value
// - user_info - Object with `usergroups` array and `hb`
// - callback - `function (err, res)`
//   - res - array of sanitized items. If `sections` is not array - will be plain sanitized section
//
'use strict';


const _       = require('lodash');
const Promise = require('bluebird');

const fields = [
  '_id',
  'hid',
  'title',
  'parent',
  'description',
  'is_category',
  'is_votable',
  'is_writable',
  'level', // not in the model, added by N.models.Section.getChildren
  'cache',
  'cache_hb'
];


module.exports = Promise.coroutine(function* (N, sections, user_info) {
  let res;

  if (!Array.isArray(sections)) {
    res = [ sections ];
  } else {
    res = sections.slice();
  }

  res = res.map(item => _.pick(item, fields));

  let params = {
    user_id: user_info.user_id,
    usergroup_ids: user_info.usergroups
  };

  let can_see_hellbanned = yield N.settings.get('can_see_hellbanned', params, {});

  res = res.map(item => {
    if (item.cache_hb && (user_info.hb || can_see_hellbanned)) {
      item.cache = item.cache_hb;
    }
    delete item.cache_hb;

    return item;
  });

  if (Array.isArray(sections)) return res;

  return res[0];
});

module.exports.fields = fields;
