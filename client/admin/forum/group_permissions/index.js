'use strict';


N.wire.on('admin.forum.group_permissions.destroy', function group_permissions_destroy(event) {
  if (!window.confirm(t('confirm_reset_permissions'))) {
    return;
  }
 
  var request = {
    section_id:   $(event.currentTarget).data('sectionId')
  , usergroup_id: $(event.currentTarget).data('usergroupId')
  };

  N.io.rpc('admin.forum.group_permissions.destroy', request, function (err) {
    if (err) {
      return false; // Invoke standard error handling.
    }

    // Refresh page to show result of the reset.
    window.location.reload();
  });
});
