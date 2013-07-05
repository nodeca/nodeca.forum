'use strict';

var DraftStorage = require('../../_draft');

var draft = new DraftStorage();

// Editor class
var Editor;

var editor = {};

function initEditor ($parent_post) {
  // Create editing form instance
  editor.$form = $(N.runtime.render('forum.thread.reply'));
  editor.$form.hide();

  // Insert editing form after editor post
  $parent_post.after(editor.$form);

  editor.field = new Editor();

  // Insert editor after editor post
  editor.field.attach(editor.$form.find('.forum-reply__editor'));

  // Animate form
  editor.$form.fadeIn();
}

function dropEditor () {
  editor.field.remove();
  editor.field = null;

  editor.$form.remove();
  editor.$form = null;
}

N.wire.on('forum.post.reply', function (event) {
  var $button = $(event.currentTarget),
      parent_post_id = $button.data('post-id'),
      $parent_post = $('#post' + parent_post_id);

  // Check if previous editor exists
  if (editor.$form) {
    // If already writing reply to this post, then nothing to do
    if (parent_post_id === editor.parent_post_id) {
      return;
    }

    // Save draft and remove editor
    draft.save(editor.parent_post_id, 'forum.post', editor.field.value());
    dropEditor();
  }

  N.loader.loadAssets('editor', function () {
    Editor = require("editor");

    // Init editor and load draft
    initEditor($parent_post);
    editor.parent_post_id = parent_post_id;
    editor.field.value(draft.find(editor.parent_post_id, 'forum.post') || '');
  });
});

N.wire.on('forum.reply.save', function () {
  // TODO: Save reply on server
  draft.remove(editor.parent_post_id, 'forum.post');
  dropEditor();
});

N.wire.on('forum.reply.cancel', function () {
  draft.save(editor.parent_post_id, 'forum.post', editor.field.value());
  dropEditor();
});

N.wire.on('navigate.exit', function () {
  if (editor.$form) {
    if (window.confirm(t('leave_message'))) {
      draft.save(editor.parent_post_id, 'forum.post', editor.field.value());
      dropEditor();
    }
    // TODO: prevent leaving page
  }
});
