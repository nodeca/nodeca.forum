// Popup dialog to subscribe
//
// options:
//
// - subscription (will be updated after OK click)
//


'use strict';


var _ = require('lodash');


var $dialog;
var params;
var doneCallback;


N.wire.once(module.apiPath, function init_handlers() {

  // Submit button handler
  //
  N.wire.on(module.apiPath + ':submit', function submit_subscription_dlg(form) {
    params.subscription = +form.fields.type;

    $dialog
      .on('hidden.bs.modal', doneCallback)
      .modal('hide');
  });


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
N.wire.on(module.apiPath, function show_subscription_dlg(options, callback) {
  params = options;
  doneCallback = callback;

  $dialog = $(N.runtime.render(module.apiPath, _.assign({ submit_action: module.apiPath + ':submit' }, params)));

  $('body').append($dialog);

  // When dialog closes - remove it from body and free resources
  $dialog
    .on('shown.bs.modal', function () {
      $dialog.find('.btn-default').focus();
    })
    .on('hidden.bs.modal', function () {
      $dialog.remove();
      $dialog = null;
      doneCallback = null;
      params = null;
    })
    .modal('show');
});
