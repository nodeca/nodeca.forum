// Popup IP info dialog
//
// options:
// - postId
//
'use strict';


let $dialog;


N.wire.once('forum.topic.ip_info_dlg', function init_handlers() {

  // Close dialog on sudden page exit (if user click back button in browser)
  //
  N.wire.on('navigate.exit', function teardown_page() {
    if ($dialog) {
      $dialog.modal('hide');
    }
  });
});


// Init dialog
//
N.wire.on('forum.topic.ip_info_dlg', function show_ip_info_dlg(options) {
  return N.io.rpc('forum.topic.post.ip_info', { post_id: options.postId }).then(res => {
    $dialog = $(N.runtime.render('forum.topic.ip_info_dlg', res));

    $('body').append($dialog);

    // When dialog closes - remove it from body and free resources
    $dialog
      .on('hidden.bs.modal', function () {
        $dialog.remove();
        $dialog = null;
      })
      .modal('show');
  });
});
