'use strict';

N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  N.wire.before('admin.forum.group_permissions.destroy', function confirm_group_permissions_destroy(data, callback) {
    N.wire.emit('admin.core.blocks.confirm', t('confirm_reset_permissions'), callback);
  });


  N.wire.on('admin.forum.group_permissions.destroy', function group_permissions_destroy(data) {
    var request = {
      section_id:   data.$this.data('sectionId'),
      usergroup_id: data.$this.data('usergroupId')
    };

    N.io.rpc('admin.forum.group_permissions.destroy', request).then(function () {
      // Refresh page to show result of the reset.
      window.location.reload();
    });
  });
});
