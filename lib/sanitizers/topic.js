// Sanitize statuses and fields for topics
//
// - N
// - topics - array of models.forum.Topic. Could be plain value
// - user_info - Object with `usergroups` array and `hb`
// - callback - `function (err, res)`
//   - res - array of sanitized items. If `topics` is not array - will be plain sanitized topic
//
'use strict';


var _ = require('lodash');
var thenify = require('thenify');


var fields = [
  '_id',
  'hid',
  'title',
  'views_count',
  'last_post_hid',
  'cache',
  'cache_hb',
  'st',
  'ste',
  'del_reason',
  'del_by',
  'section'
];


module.exports = thenify.withCallback(function (N, topics, user_info, callback) {
  // Shortcut
  var Topic = N.models.forum.Topic;

  var res;

  if (!Array.isArray(topics)) {
    res = [ topics ];
  } else {
    res = topics.slice();
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
      if (item.st === Topic.statuses.HB && !can_see_hellbanned) {
        item.st = item.ste;
        delete item.ste;
      }

      if (item.cache_hb && (user_info.hb || can_see_hellbanned)) {
        item.cache = item.cache_hb;
      }
      delete item.cache_hb;

      return item;
    });

    if (Array.isArray(topics)) {
      callback(null, res);
    } else {
      callback(null, res[0]);
    }
  });
});

module.exports.fields = fields;
