'use strict';


N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  // Edit subscription button handler
  //
  N.wire.on(module.apiPath + ':edit', function edit_subscription(data) {
    let hid = data.$this.data('hid');
    let params = { subscription: data.$this.data('subscription') };

    return Promise.resolve()
      .then(() => N.wire.emit('forum.section.subscription', params))
      .then(() => N.io.rpc('forum.section.subscribe', { section_hid: hid, type: params.subscription }))
      .then(() => {
        data.$this.replaceWith(
          N.runtime.render(module.apiPath + '.button', { section: { hid }, subscription: params.subscription })
        );
      });
  });
});
