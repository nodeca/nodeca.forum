'use strict';


var _ = require('lodash');

var updateModeratorsData = require('./_lib/update_moderators_data');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    section_id: { type: 'string', required: true }
  , user_id:    { type: 'string', required: true }
  , settings:   { type: 'object', required: true }
  });

  N.wire.on(apiPath, function moderator_update(env, callback) {
    var store = N.settings.getStore('forum_moderator');

    if (!store) {
      callback({
        code:    N.io.APP_ERROR
      , message: 'Settings store `forum_moderator` is not registered.'
      });
      return;
    }

    N.models.forum.Section.findById(env.params.section_id, function (err, section) {
      if (err) {
        callback(err);
        return;
      }

      if (!section) {
        callback(N.io.NOT_FOUND);
        return;
      }

      // Fetch user just to ensure it exists.
      N.models.users.User.findById(env.params.user_id, '_id', { lean: true }, function (err, user) {
        if (err) {
          callback(err);
          return;
        }

        if (!user) {
          callback(N.io.NOT_FOUND);
          return;
        }

        var validationError;

        _.forEach(env.params.settings, function (value, key) {
          validationError = store.validateSetting(key, value);

          if (null !== validationError) {
            return false; // break;
          }
        });

        // Invalid input settings.
        if (validationError) {
          callback({ code: N.io.CLIENT_ERROR, message: validationError });
          return;
        }

        // Create raw settings storage if it does not exist.
        // It is used to store interface state on particular document and remap
        // into setting stores with resolved value inheritance.
        section.raw_settings                 = section.raw_settings || {};
        section.raw_settings.forum_moderator = section.raw_settings.forum_moderator || {};

        // Write new raw settings.
        if (!_.isEmpty(env.params.settings)) {
          section.raw_settings.forum_moderator[user._id] = env.params.settings;
        } else {
          delete section.raw_settings.forum_moderator[user._id];
        }

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
};
