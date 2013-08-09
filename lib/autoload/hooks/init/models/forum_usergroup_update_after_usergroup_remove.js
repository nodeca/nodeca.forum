// Remove usergroup-related setting entries at `section_usergroup` store when
// some usergroup itself is removed.


'use strict';


module.exports = function (N) {
  N.wire.before('init:models.users.UserGroup', function section_usergroup_update_after_usergroup_remove(schema) {
    schema.post('remove', function (usergroup) {
      var SectionUsergroupStore = N.settings.getStore('section_usergroup');

      if (!SectionUsergroupStore) {
        N.logger.error('Settings store `section_usergroup` is not registered.');
        return;
      }

      SectionUsergroupStore.removeUsergroup(usergroup._id, function (err) {
        if (err) {
          N.logger.error('After %s usergroup is removed, cannot remove related settings: %s', usergroup._id, err);
        }
      });
    });
  });
};
