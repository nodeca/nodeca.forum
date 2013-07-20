// Update usergroup permissions for a forum section.


'use strict';


var _ = require('lodash');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    section_id:   { type: 'string', required: true }
  , usergroup_id: { type: 'string', required: true }
  , settings:     { type: 'object', required: true }
  });

  N.wire.on(apiPath, function section_permissions_update(env, callback) {
    var ForumUsergroupStore = N.settings.getStore('forum_usergroup');

    if (!ForumUsergroupStore) {
      callback({
        code:    N.io.APP_ERROR
      , message: 'Settings store `forum_usergroup` is not registered.'
      });
      return;
    }

    // Fetch forum section just to ensure it exists.
    N.models.forum.Section.findById(env.params.section_id, '_id', { lean: true }, function (err, section) {
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

        var settings = {};

        _.forEach(env.params.settings, function (value, key) {
          settings[key] = { value: value, force: true };
        });

        ForumUsergroupStore.set(settings, { forum_id: section._id, usergroup_id: usergroup._id }, callback);
      });
    });
  });
};
