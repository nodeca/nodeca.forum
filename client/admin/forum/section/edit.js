'use strict';


N.wire.on('navigate.done:' + module.apiPath, function page_setup() {
  return N.wire.emit('admin.forum.section.form.setup', N.runtime.page_data);
});


N.wire.on('navigate.exit:' + module.apiPath, function page_teardown() {
  return N.wire.emit('admin.forum.section.form.teardown', null);
});
