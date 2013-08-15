// Update forum moderator settings.


'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    section_id: { format: 'mongo', required: true }
  , user_id:    { format: 'mongo', required: true }
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

  N.wire.on(apiPath, function moderator_update(env, callback) {
    var SectionModeratorStore = N.settings.getStore('section_moderator');

    if (!SectionModeratorStore) {
      callback({
        code:    N.io.APP_ERROR
      , message: 'Settings store `section_moderator` is not registered.'
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
      N.models.users.User.findById(env.params.user_id, '_id', { lean: true }, function (err, user) {
        if (err) {
          callback(err);
          return;
        }

        if (!user) {
          callback(N.io.NOT_FOUND);
          return;
        }

        SectionModeratorStore.set(env.params.settings, { section_id: section._id, user_id: user._id }, callback);
      });
    });
  });
};
