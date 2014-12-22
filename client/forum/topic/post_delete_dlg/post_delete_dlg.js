// Popup dialog to delete post
//
// options:
// - postId
// - asModerator
// - canDeleteHard
// - method - out. 'hard' or 'soft'
//


'use strict';

var $dialog;
var params;
var doneCallback;


N.wire.once('forum.topic.post_delete_dlg', function init_handlers() {

  // Submit button handler
  //
  N.wire.on('forum.topic.post_delete_dlg:submit', function submit_post_delete_dlg(form) {
    var data = {
      post_id: params.postId,
      method: form.fields.method || 'soft',
      as_moderator: params.asModerator
    };

    if ($.trim(form.fields.reason) !== '') {
      data.reason = form.fields.reason;
    }

    N.io.rpc('forum.topic.post.destroy', data).done(function () {
      params.method = data.method;

      $dialog
        .on('hidden.bs.modal', doneCallback)
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
N.wire.on('forum.topic.post_delete_dlg', function show_post_delete_dlg(options, callback) {
  params = options;
  doneCallback = callback;

  $dialog = $(N.runtime.render('forum.topic.post_delete_dlg', params));

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
