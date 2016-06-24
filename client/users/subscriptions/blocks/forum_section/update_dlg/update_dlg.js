// Popup dialog to subscribe
//
// options:
//
// - subscription (will be updated after OK click)
//
'use strict';


const _ = require('lodash');


let $dialog;
let params;
let result;


N.wire.once(module.apiPath, function init_handlers() {

  // Submit button handler
  //
  N.wire.on(module.apiPath + ':submit', function submit_subscription_dlg(form) {
    params.subscription = result = +form.fields.type;
    $dialog.modal('hide');
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
N.wire.on(module.apiPath, function show_subscription_dlg(options) {
  params = options;
  $dialog = $(N.runtime.render(module.apiPath, _.assign({ submit_action: module.apiPath + ':submit' }, params)));
  $('body').append($dialog);

  return new Promise((resolve, reject) => {
    $dialog
      .on('shown.bs.modal', function () {
        $dialog.find('.btn-secondary').focus();
      })
      .on('hidden.bs.modal', function () {
        // When dialog closes - remove it from body and free resources.
        $dialog.remove();
        $dialog = null;
        params = null;

        if (result) resolve(result);
        else reject('CANCELED');

        result = null;
      })
      .modal('show');
  });
});
