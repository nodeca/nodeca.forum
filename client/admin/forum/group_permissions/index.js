'use strict';


N.wire.before('admin.forum.group_permissions.destroy', function confirm_group_permissions_destroy(event, callback) {
  N.wire.emit('admin.core.blocks.confirm', t('confirm_reset_permissions'), callback);
});


N.wire.on('admin.forum.group_permissions.destroy', function group_permissions_destroy(event) {
  var request = {
    section_id:   $(event.target).data('sectionId')
  , usergroup_id: $(event.target).data('usergroupId')
  };

  N.io.rpc('admin.forum.group_permissions.destroy', request, function (err) {
    if (err) {
      return false; // Invoke standard error handling.
    }

    // Refresh page to show result of the reset.
    window.location.reload();
  });
});
