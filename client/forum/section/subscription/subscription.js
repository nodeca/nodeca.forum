// Popup dialog to subscribe topic
//
// options:
//
// - subscription (will be updated after OK click)
//


'use strict';

var $dialog;
var params;
var doneCallback;


N.wire.once('forum.section.subscription', function init_handlers() {

  // Submit button handler
  //
  N.wire.on('forum.section.subscription:submit', function submit_subscription(form) {
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
N.wire.on('forum.section.subscription', function show_subscription(options, callback) {
  params = options;
  doneCallback = callback;

  $dialog = $(N.runtime.render('forum.section.subscription', params));

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
