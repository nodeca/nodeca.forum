// Sanitize statuses and fields for sections
//
// - N
// - sections - array of models.forum.Section. Could be plain value
// - user_info - Object with `usergroups` array and `hb`
// - callback - `function (err, res)`
//   - res - array of sanitized items. If `sections` is not array - will be plain sanitized section
//
'use strict';


var _ = require('lodash');


var fields = [
  '_id',
  'hid',
  'title',
  'parent',
  'description',
  'moderators',
  'is_category',
  'cache',
  'cache_hb'
];


module.exports = function (N, sections, user_info, callback) {
  var res;

  if (!Array.isArray(sections)) {
    res = [ sections ];
  } else {
    res = sections.slice();
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
      if (item.cache_hb && (user_info.hb || can_see_hellbanned)) {
        item.cache = item.cache_hb;
      }
      delete item.cache_hb;

      return item;
    });

    if (Array.isArray(sections)) {
      callback(null, res);
    } else {
      callback(null, res[0]);
    }
  });
};

module.exports.fields = fields;
