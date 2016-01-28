// Sanitize statuses and fields for posts
//
// - N
// - posts - array of models.forum.Post. Could be plain value
// - user_info - Object with `usergroups` array and `hb`
// - callback - `function (err, res)`
//   - res - array of sanitized items. If `posts` is not array - will be plain sanitized post
//
'use strict';


const _  = require('lodash');
const co = require('co');

const fields = [
  '_id',
  'hid',
  'to',
  'to_user',
  'to_fhid',
  'to_thid',
  'to_phid',
  'tail',
  'html',
  'user',
  'legacy_nick',
  'ts',
  'st',
  'ste',
  'del_reason',
  'del_by',
  'votes',
  'votes_hb',
  'bookmarks'
];


module.exports = co.wrap(function* (N, posts, user_info) {
  let res;

  if (!Array.isArray(posts)) {
    res = [ posts ];
  } else {
    res = posts.slice();
  }

  res = res.map(item => _.pick(item, fields));

  let params = {
    user_id: user_info.user_id,
    usergroup_ids: user_info.usergroups
  };

  let can_see_hellbanned = yield N.settings.get('can_see_hellbanned', params, {});

  res = res.map(item => {
    if (item.st === N.models.forum.Post.statuses.HB && can_see_hellbanned) {
      item.st = item.ste;
      delete item.ste;
    }

    if (user_info.hb) {
      item.votes = item.votes_hb;
    }
    delete item.votes_hb;

    return item;
  });

  if (Array.isArray(posts)) return res;

  return res[0];
});

module.exports.fields = fields;
