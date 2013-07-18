// Update usergroup permissions for a forum section.


'use strict';


var _ = require('lodash');

var updateForumPermissions = require('./_lib/update_forum_permissions');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    section_id:   { type: 'string', required: true }
  , usergroup_id: { type: 'string', required: true }
  , settings: {
      type: 'object'
    , required: true
    , patternProperties: {
        '.*': {
          type: 'object'
        , additionalProperties: false
        , properties: {
            value:     {                  required: true }
          , force:     { type: 'boolean', required: true }
          , overriden: { type: 'boolean', required: true }
          }
        }
      }
    }
  });

  N.wire.on(apiPath, function section_permissions_update(env, callback) {
    var store = N.settings.getStore('forum_usergroup');

    if (!store) {
      callback({
        code:    N.io.APP_ERROR
      , message: 'Settings store `forum_usergroup` is not registered.'
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

      // Fetch usergroup just to ensure it exists.
      N.models.users.UserGroup.findById(env.params.usergroup_id, '_id', { lean: true }, function (err, usergroup) {
        if (err) {
          callback(err);
          return;
        }

        if (!usergroup) {
          callback(N.io.NOT_FOUND);
          return;
        }

        var validationError;

        _.forEach(env.params.settings, function (setting, key) {
          validationError = store.validateSetting(key, setting.value);

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
        section.raw_settings.forum_usergroup = section.raw_settings.forum_usergroup || {};

        // Write new raw settings.
        section.raw_settings.forum_usergroup[usergroup._id] = env.params.settings;

        section.markModified('raw_settings.forum_usergroup');
        section.save(function (err) {
          if (err) {
            callback(err);
            return;
          }

          // Remap raw settings on all sections into actual setting stores
          // with inheritance resolving.
          updateForumPermissions(N, callback);
        });
      });
    });
  });
};
