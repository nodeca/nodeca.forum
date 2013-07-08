'use strict';


N.wire.on('navigate.done:' + module.apiPath, function page_setup(data, callback) {
  N.wire.emit('admin.forum.section.form.setup', N.runtime.page_data, callback);
});


N.wire.on('navigate.exit:' + module.apiPath, function page_teardown(data, callback) {
  N.wire.emit('admin.forum.section.form.teardown', null, callback);
});
