// Clean up collections on user deletion
//

'use strict';

const Promise = require('bluebird');


module.exports = function (N) {
  N.wire.before('init:models.users.User', function init_user_add_remove_hook(User) {
    // Clean up settings on user deletion (not deleting any actual content)
    //
    User.pre('remove', function (callback) {
      var self = this;

      Promise.coroutine(function* () {

        yield N.models.forum.ExcludedSections.remove({ user: self._id });
        yield N.models.forum.PostBookmark.remove({ user: self._id });

      })().asCallback(callback);
    });
  });
};
