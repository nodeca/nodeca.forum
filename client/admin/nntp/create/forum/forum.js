'use strict';


N.wire.on(module.apiPath + ':submit', function save_group(form) {
  return N.io.rpc('admin.nntp.create.forum.exec', form.fields)
             .then(() => N.wire.emit('notify.info', t('message_created')))
             .then(() => N.wire.emit('navigate.to', { apiPath: 'admin.nntp.index' }));
});
