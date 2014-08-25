'use strict';

N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  N.wire.before('admin.forum.moderator.destroy', function confirm_moderator_destroy(event, callback) {
    N.wire.emit('admin.core.blocks.confirm', t('confirm_remove'), callback);
  });


  N.wire.on('admin.forum.moderator.destroy', function moderator_destroy(event) {
    var request = {
      section_id: $(event.target).data('sectionId')
    , user_id:    $(event.target).data('userId')
    };

    N.io.rpc('admin.forum.moderator.destroy', request, function (err) {
      if (err) {
        return false; // Invoke standard error handling.
      }

      // Refresh page to show result of the reset.
      window.location.reload();
    });
  });
});
