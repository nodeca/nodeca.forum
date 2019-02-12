// Clean up collections on user deletion
//

'use strict';


module.exports = function (N) {
  N.wire.before('init:models.users.User', function init_user_add_remove_hook(User) {
    // Clean up settings on user deletion (not deleting any actual content)
    //
    async function onRemoveCleanup(id) {
      await N.models.forum.ExcludedSections.deleteMany({ user: id });
      await N.models.forum.PostBookmark.deleteMany({ user: id });
    }

    User.pre('remove', function () {
      return onRemoveCleanup(this._id);
    });
  });
};
