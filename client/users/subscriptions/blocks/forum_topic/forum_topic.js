'use strict';


N.wire.on('users.subscriptions.forum_topic:mark_tab_read', function mark_tab_read() {
  return N.io.rpc('forum.mark_read', { ts: N.runtime.page_data.mark_cut_ts })
             .then(() => N.wire.emit('navigate.reload'));
});
