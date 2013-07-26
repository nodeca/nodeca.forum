'use strict';


N.wire.on('admin.forum.moderator.destroy', function moderator_destroy(event) {
  if (!window.confirm(t('confirm_remove'))) {
    return;
  }
 
  var request = {
    section_id: $(event.currentTarget).data('sectionId')
  , user_id:    $(event.currentTarget).data('userId')
  };

  N.io.rpc('admin.forum.moderator.destroy', request, function (err) {
    if (err) {
      return false; // Invoke standard error handling.
    }

    // Refresh page to show result of the reset.
    window.location.reload();
  });
});
