'use strict';


var _     = require('lodash');
var async = require('async');

var updateModeratorsData = require('./_lib/update_moderators_data');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    section_id: { type: 'string', required: true }
  , user_id:    { type: 'string', required: true }
  });

  N.wire.on(apiPath, function section_moderator_destroy(env, callback) {
    N.models.forum.Section.findById(env.params.section_id, function (err, section) {
      if (err) {
        callback(err);
        return;
      }

      if (!section) {
        callback(N.io.NOT_FOUND);
        return;
      }

      if (_.isEmpty(section.raw_settings) ||
          _.isEmpty(section.raw_settings.forum_moderator) ||
          _.isEmpty(section.raw_settings.forum_moderator[env.params.user_id])) {
        callback(); // Already deleted - OK.
        return;
      }

      N.models.forum.Section
          .find({ parent_list: section._id })
          .select('raw_settings.forum_moderator')
          .exec(function (err, descendants) {

        if (err) {
          callback(err);
          return;
        }

        // Root-level raw setting tables must contain values for all possible
        // settings. So walk through section's descendants add missed values
        // for their raw settings from current section.
        async.forEach(descendants, function (descendant, next) {
          if (_.isEmpty(descendant.raw_settings) ||
              _.isEmpty(descendant.raw_settings.forum_moderator) ||
              _.isEmpty(descendant.raw_settings.forum_moderator[env.params.user_id])) {
            next(); // Skip descendants without *own* moderator records.
            return;
          }

          _.forEach(section.raw_settings.forum_moderator[env.params.user_id], function (value, key) {
            if (_.has(descendant.raw_settings.forum_moderator[env.params.user_id], key)) {
              return; // Skip setting which the descendant already has.
            }

            descendant.raw_settings.forum_moderator[env.params.user_id][key] = value;
            descendant.markModified('raw_settings.forum_moderator');
          });

          if (descendant.isModified()) {
            descendant.save(next);
          } else {
            next();
          }
        }, function (err) {
          if (err) {
            callback(err);
            return;
          }

          // Actually delete moderator record.
          delete section.raw_settings.forum_moderator[env.params.user_id];
          section.markModified('raw_settings.forum_moderator');

          section.save(function (err) {
            if (err) {
              callback(err);
              return;
            }

            // Remap raw settings on all sections into actual setting stores
            // with inheritance resolving, and update moderator list fields.
            updateModeratorsData(N, callback);
          });
        });
      });
    });
  });
};
