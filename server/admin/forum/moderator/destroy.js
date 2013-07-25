// Remove single moderator entry at section.


'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    section_id: { type: 'string', required: true }
  , user_id:    { type: 'string', required: true }
  });

  N.wire.on(apiPath, function moderator_destroy(env, callback) {
    var ForumModeratorStore = N.settings.getStore('forum_moderator');

    if (!ForumModeratorStore) {
      callback({
        code:    N.io.APP_ERROR
      , message: 'Settings store `forum_moderator` is not registered.'
      });
      return;
    }

    ForumModeratorStore.removeModerator(env.params.section_id, env.params.user_id, callback);
  });
};
