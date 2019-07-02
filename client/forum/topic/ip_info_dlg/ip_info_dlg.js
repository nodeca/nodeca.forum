// Popup IP info dialog
//
// options:
// - post_id
//
'use strict';


let $dialog;


N.wire.once(module.apiPath, function init_handlers() {

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
N.wire.on(module.apiPath, function show_ip_info_dlg(options) {
  return N.io.rpc('forum.topic.post.ip_info', { post_id: options.post_id }).then(res => {
    $dialog = $(N.runtime.render(module.apiPath, res));

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
