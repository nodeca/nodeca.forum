// Sanitize statuses and fields for posts
//
// - N
// - posts - array of models.forum.Post. Could be plain value
// - user_info - Object with `usergroups` array and `hb`
// - callback - `function (err, res)`
//   - res - array of sanitized items. If `posts` is not array - will be plain sanitized post
//
'use strict';


var _ = require('lodash');
var thenify = require('thenify');


var fields = [
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


module.exports = thenify.withCallback(function (N, posts, user_info, callback) {
  // Shortcut
  var Post = N.models.forum.Post;

  var res;

  if (!Array.isArray(posts)) {
    res = [ posts ];
  } else {
    res = posts.slice();
  }

  res = res.map(function (item) {
    return _.pick(item, fields);
  });

  var params = {
    user_id: user_info.user_id,
    usergroup_ids: user_info.usergroups
  };

  N.settings.get('can_see_hellbanned', params, {}, function (err, can_see_hellbanned) {
    if (err) {
      callback(err);
      return;
    }

    res = res.map(function (item) {
      if (item.st === Post.statuses.HB && can_see_hellbanned) {
        item.st = item.ste;
        delete item.ste;
      }

      if (user_info.hb) {
        item.votes = item.votes_hb;
      }
      delete item.votes_hb;

      return item;
    });

    if (Array.isArray(posts)) {
      callback(null, res);
    } else {
      callback(null, res[0]);
    }
  });
});

module.exports.fields = fields;
