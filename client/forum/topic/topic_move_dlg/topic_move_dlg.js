// Popup dialog to move topics
//
// options:
//
// - section_hid_from
// - section_hid_to
// - section_hid_default
//
'use strict';


const _ = require('lodash');


let $dialog;
let params;
let result;


N.wire.once(module.apiPath, function init_handlers() {

  // Submit button handler
  //
  N.wire.on(module.apiPath + ':submit', function submit_topic_move_dlg(form) {
    params.section_hid_to = +form.fields.section_hid;
    result = params;
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
N.wire.on(module.apiPath, function show_topic_move_dlg(options) {
  // protection against dialog being created twice
  if ($dialog) return Promise.reject('CANCELED');

  params = options;
  params.section_hid_default = params.section_hid_default || params.section_hid_from;

  return N.io.rpc('forum.topic.move.sections', { section_hid: params.section_hid_from }).then(res => {
    $dialog = $(N.runtime.render(module.apiPath, _.assign({ apiPath: module.apiPath }, params, res)));

    $('body').append($dialog);

    return new Promise((resolve, reject) => {
      $dialog
        .on('shown.bs.modal', () => {
          $dialog.find('.btn-secondary').focus();
        })
        .on('hidden.bs.modal', () => {
          // When dialog closes - remove it from body and free resources
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
});
