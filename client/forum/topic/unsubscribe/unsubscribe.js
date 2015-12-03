'use strict';

N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  // Edit subscription button handler
  //
  N.wire.on(module.apiPath + ':edit', function edit_subscription(data, callback) {
    var hid = data.$this.data('hid');
    var params = { subscription: data.$this.data('subscription') };

    N.wire.emit('forum.topic.topic_subscription', params, function () {
      N.io.rpc('forum.topic.subscribe', { topic_hid: hid, type: params.subscription }).done(function () {

        data.$this.replaceWith(
          N.runtime.render(module.apiPath + '.button', { topic: { hid: hid }, subscription: params.subscription })
        );

        callback();
      });
    });
  });
});
