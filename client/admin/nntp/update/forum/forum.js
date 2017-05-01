'use strict';


N.wire.on(module.apiPath + ':submit', function save_group(form) {
  return N.io.rpc('admin.nntp.update.forum.exec', form.fields)
             .then(() => N.wire.emit('notify.info', t('message_updated')));
});
