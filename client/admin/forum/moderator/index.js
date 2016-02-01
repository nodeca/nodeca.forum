'use strict';


N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  N.wire.before('admin.forum.moderator.destroy', function confirm_moderator_destroy() {
    return N.wire.emit('admin.core.blocks.confirm', t('confirm_remove'));
  });


  N.wire.on('admin.forum.moderator.destroy', function moderator_destroy(data) {
    let request = {
      section_id: data.$this.data('sectionId'),
      user_id:    data.$this.data('userId')
    };

    return N.io.rpc('admin.forum.moderator.destroy', request).then(() => {
      // Refresh page to show result of the reset.
      window.location.reload();
    });
  });
});
