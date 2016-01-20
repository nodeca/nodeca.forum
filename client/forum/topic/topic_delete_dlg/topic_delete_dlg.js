// Popup dialog to delete topic
//
// options:
// - topicId
// - asModerator
// - canDeleteHard
// - method - out. 'hard' or 'soft'
//


'use strict';

var $dialog;
var params;
var doneCallback;


N.wire.once('forum.topic.topic_delete_dlg', function init_handlers() {

  // Submit button handler
  //
  N.wire.on('forum.topic.topic_delete_dlg:submit', function submit_topic_delete_dlg(form) {
    var data = {
      topic_hid: params.topicHid,
      method: form.fields.method || 'soft',
      as_moderator: params.asModerator
    };

    if ($.trim(form.fields.reason) !== '') {
      data.reason = form.fields.reason;
    }

    N.io.rpc('forum.topic.destroy', data).done(function () {
      params.method = data.method;

      let done = doneCallback;

      $dialog
        .on('hidden.bs.modal', () => done())
        .modal('hide');
    });
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
N.wire.on('forum.topic.topic_delete_dlg', function show_topic_delete_dlg(options, callback) {
  params = options;
  doneCallback = callback;

  $dialog = $(N.runtime.render('forum.topic.topic_delete_dlg', params));

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
