// Clean up collections on user deletion
//

'use strict';


const { callbackify } = require('util');


module.exports = function (N) {
  N.wire.before('init:models.users.User', function init_user_add_remove_hook(User) {
    // Clean up settings on user deletion (not deleting any actual content)
    //
    const onRemoveCleanup = callbackify(async function (id) {
      await N.models.forum.ExcludedSections.remove({ user: id });
      await N.models.forum.PostBookmark.remove({ user: id });
    });

    User.pre('remove', function (callback) {
      onRemoveCleanup(this._id, callback);
    });
  });
};
