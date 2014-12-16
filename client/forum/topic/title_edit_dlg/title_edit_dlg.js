// Popup dialog to edit topic title
//
// options:
// - topic_id
// - mod_action - true: edit as moderator, false: edit as user
// - title - old title of topic
// - new_title - out, new title of topic
//


'use strict';

var $dialog;
var params;
var doneCallback;


N.wire.once('forum.topic.title_edit_dlg', function init_handlers() {

  // Listen submit button
  //
  N.wire.on('forum.topic.title_edit_dlg:submit', function submit_title_edit_dlg(form) {
    var title = form.fields.title;

    if (!title || !$.trim(title)) {
      N.wire.emit('notify', t('err_empty_title'));
      return;
    }

    var data = {
      moderator_action: params.mod_action,
      topic_id: params.topic_id,
      title: title
    };

    N.io.rpc('forum.topic.title_update', data).done(function () {
      params.new_title = title;

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
N.wire.on('forum.topic.title_edit_dlg', function show_title_edit_dlg(options, callback) {
  params = options;
  doneCallback = callback;

  $dialog = $(N.runtime.render('forum.topic.title_edit_dlg', { title: params.title }));

  $('body').append($dialog);

  // When dialog closes - remove it from body and free resources
  $dialog
    .on('hidden.bs.modal', function () {
      $dialog.remove();
      $dialog = null;
      doneCallback = null;
      params = null;
    })
    .modal('show');
});
