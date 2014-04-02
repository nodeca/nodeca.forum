// Forum Topic post edit logic
//

'use strict';


// Edit state
//
// - editor:          editor instance: TimyMCE
// - $form:           reply form with editor
// - hid:             topic's human id
// - post_id:         `_id` of the current post
// - section_hid:     id of the current section
//
var editorState = {};

// helper to destroy editor & free resourses
//
function removeEditor() {
  // cleanup
  if (editorState.$form) {
    editorState.$form.remove();
  }
  if (editorState.editor) {
    editorState.editor.remove();
  }
  editorState = {};
}

// init on page load
//
N.wire.on('navigate.done:forum.topic', function (data) {
  editorState.hid = +data.params.hid;
  editorState.section_hid = +data.params.section_hid;
});

// free resources on page exit
//
N.wire.on('navigate.exit:forum.topic', function () {
  removeEditor();
});

// click on post edit link
//
N.wire.on('forum.post.edit', function (event) {
  var $button = $(event.currentTarget),
    button_offset = $button.offset().top,
    post_id = $button.data('post-id') || 0;

  // Check if previous editor exists
  if (editorState.$form) {
    // If already editing this post, then nothing to do
    if (post_id === editorState.post_id) {
      return;
    }

    // Show hidden post
    if ('post-edit' === editorState.type) {
      $('#post' + editorState.post_id).show();
    }

    removeEditor();
  }

  N.loader.loadAssets('editor', function () {

    editorState.post_id = post_id;

    // Create editing form instance
    editorState.$form = $(N.runtime.render('forum.topic.reply', {
      type: editorState.type
    }));
    editorState.$form.hide();

    // Find target, to attach editor after
    var $target_post = $('#post' + editorState.post_id);

    // Insert editing form after post
    $target_post.after(editorState.$form);

    // Initialize editable area
    var Editor = require('nodeca-editor');
    editorState.editor = new Editor();
    editorState.editor.attach(editorState.$form.find('.forum-reply__editor'));

    // Load previously saved text
    editorState.editor.value($target_post.find('.forum-post__message').html());

    // Show form
    editorState.$form.fadeIn();

    // Fix scroll
    $('html,body').animate({scrollTop: '+=' + ($button.offset().top - button_offset)}, 0);

    // Hide post
    $target_post.hide();
  });
});

// event handler on Save button click
//
N.wire.on('forum.post.edit.save', function () {

  // TODO: implement post saving

  editorState.$form.fadeOut(function () {
    removeEditor();
  });
});

// on Cancel button remove editor and store draft
//
N.wire.on('forum.post.edit.cancel', function () {
  editorState.$form.fadeOut(function () {
    removeEditor();
  });
});

// terminate editor if user tries to reply post on the same page
//
N.wire.on('forum.post.reply', function () {
  removeEditor();
});
