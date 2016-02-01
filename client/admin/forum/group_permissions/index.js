'use strict';


N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  N.wire.before('admin.forum.group_permissions.destroy', function confirm_group_permissions_destroy() {
    return N.wire.emit('admin.core.blocks.confirm', t('confirm_reset_permissions'));
  });


  N.wire.on('admin.forum.group_permissions.destroy', function group_permissions_destroy(data) {
    let request = {
      section_id:   data.$this.data('sectionId'),
      usergroup_id: data.$this.data('usergroupId')
    };

    return N.io.rpc('admin.forum.group_permissions.destroy', request).then(() => {
      // Refresh page to show result of the reset.
      window.location.reload();
    });
  });
});
