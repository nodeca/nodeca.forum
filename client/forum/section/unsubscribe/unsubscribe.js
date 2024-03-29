'use strict';


N.wire.on('navigate.done:' + module.apiPath, function unsubscribe() {
  let selector = '.forum-section-unsubscribe';
  let type = $(selector).data('type');
  let section_hid = $(selector).data('section-hid');

  return Promise.resolve()
           .then(() => N.io.rpc('forum.section.change_subscription', { section_hid, type }))
           .then(() => $(selector).addClass('page-loading__m-done'));
});
