'use strict';


N.wire.on('navigate.done:' + module.apiPath, function page_setup(data, callback) {
  N.wire.emit('admin.forum.moderator.form.setup', data, callback);
});


N.wire.on('navigate.exit:' + module.apiPath, function page_teardown(data, callback) {
  N.wire.emit('admin.forum.moderator.form.teardown', data, callback);
});
