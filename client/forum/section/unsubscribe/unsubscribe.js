'use strict';

N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  // Edit subscription button handler
  //
  N.wire.on(module.apiPath + ':edit', function edit_subscription(data, callback) {
    var hid = data.$this.data('hid');
    var params = { subscription: data.$this.data('subscription') };

    N.wire.emit('forum.section.subscription', params, function () {
      N.io.rpc('forum.section.subscribe', { section_hid: hid, type: params.subscription }).then(function () {

        data.$this.replaceWith(
          N.runtime.render(module.apiPath + '.button', { section: { hid }, subscription: params.subscription })
        );

        callback();
      });
    });
  });
});
