// Remove user-related setting entries at `section_moderator` store when
// some user itself is removed.


'use strict';


module.exports = function (N) {
  N.wire.before('init:models.users.User', function section_moderator_update_after_user_remove(schema) {
    schema.post('remove', function (user) {
      var SectionModeratorStore = N.settings.getStore('section_moderator');

      if (!SectionModeratorStore) {
        N.logger.error('Settings store `section_moderator` is not registered.');
        return;
      }

      SectionModeratorStore.removeUser(user._id, function (err) {
        if (err) {
          N.logger.error('After %s user is removed, cannot remove related settings: %s', user._id, err);
        }
      });
    });
  });
};
