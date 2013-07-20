// Remove usergroup-related setting entries at `forum_usergroup` store when
// some usergroup itself is removed.


'use strict';


module.exports = function (N) {
  N.wire.before('init:models.users.UserGroup', function forum_usergroup_update_after_usergroup_remove(schema) {
    schema.post('remove', function (doc) {
      var ForumUsergroupStore = N.settings.getStore('forum_usergroup');

      if (!ForumUsergroupStore) {
        N.logger.error('Settings store `forum_usergroup` is not registered.');
        return;
      }

      ForumUsergroupStore.removeUsergroup(doc._id, function (err) {
        if (err) {
          N.logger.error('After %s usergroup is removed, cannot remove related settings: %s', doc._id, err);
        }
      });
    });
  });
};
