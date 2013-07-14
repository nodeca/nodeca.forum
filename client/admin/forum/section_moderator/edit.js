'use strict';


N.wire.on('navigate.done:' + module.apiPath, function page_setup(data, callback) {
  N.wire.emit('admin.forum.section_moderator.form.setup', data, callback);
});


N.wire.on('navigate.exit:' + module.apiPath, function page_teardown(data, callback) {
  N.wire.emit('admin.forum.section_moderator.form.teardown', data, callback);
});


N.wire.on('admin.forum.section_moderator.destroy', function section_moderator_destroy(event) {
  var sectionId = $(event.currentTarget).data('sectionId')
    , userId    = $(event.currentTarget).data('userId');

  N.io.rpc('admin.forum.section_moderator.destroy', { section_id: sectionId, user_id: userId }, function (err) {
    if (err) {
      return false; // Invoke standard error handling.
    }

    N.wire.emit('notify', { type: 'info', message: t('message_deleted') });
    N.wire.emit('navigate.to', { apiPath: 'admin.forum.section.index' });
  });
});
