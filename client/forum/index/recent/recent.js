'use strict';


N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  // Mark entire forum as read
  //
  N.wire.on(module.apiPath + ':mark_read', function mark_read() {
    return N.io.rpc('forum.mark_read', { ts: N.runtime.page_data.mark_cut_ts })
               .then(() => N.wire.emit('navigate.reload'));
  });

  // Exclude click
  //
  N.wire.on(module.apiPath + ':exclude', function exclude() {
    let params = {};

    return Promise.resolve()
      .then(() => N.io.rpc('forum.index.exclude.sections', {}))
      .then(res => {
        Object.assign(params, res);
        return N.wire.emit('forum.index.sections_exclude_dlg', params);
      })
      .then(() => N.io.rpc('forum.index.exclude.update', { sections_ids: params.selected }))
      .then(() => N.wire.emit('navigate.reload'));
  });
});
