// Update usergroup permissions for a forum section.


'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    section_id:   { type: 'string', required: true }
  , usergroup_id: { type: 'string', required: true }
  , settings: {
      type: 'object'
    , required: true
    , patternProperties: {
        '.*': {
          type: ['null', 'object']
        , additionalProperties: false
        , properties: { value: { required: true } }
        }
      }
    }
  });

  N.wire.on(apiPath, function group_permissions_update(env, callback) {
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

        ForumUsergroupStore.set(env.params.settings, { forum_id: section._id, usergroup_id: usergroup._id }, callback);
      });
    });
  });
};
