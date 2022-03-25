'use strict';


N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  // Mark entire forum as read
  //
  N.wire.on(module.apiPath + ':mark_read', function mark_read() {
    return N.io.rpc('forum.mark_read', { ts: N.runtime.page_data.mark_cut_ts })
               .then(() => N.wire.emit('navigate.reload'));
  });
});
