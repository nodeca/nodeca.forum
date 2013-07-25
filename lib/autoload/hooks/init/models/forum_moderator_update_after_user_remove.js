// Remove user-related setting entries at `forum_moderator` store when
// some user itself is removed.


'use strict';


module.exports = function (N) {
  N.wire.before('init:models.users.User', function forum_moderator_update_after_user_remove(schema) {
    schema.post('remove', function (user) {
      var ForumModeratorStore = N.settings.getStore('forum_moderator');

      if (!ForumModeratorStore) {
        N.logger.error('Settings store `forum_moderator` is not registered.');
        return;
      }

      ForumModeratorStore.removeUser(user._id, function (err) {
        if (err) {
          N.logger.error('After %s user is removed, cannot remove related settings: %s', user._id, err);
        }
      });
    });
  });
};
