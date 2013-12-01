// Forum Topic post reply logic
//

'use strict';

var _ = require('lodash');

var draft = require('../../_draft');

// Reply state
//
// - draft_id:        key to save draft text
// - editor:          editor instance: TimyMCE
// - $form:           reply form with editor
// - hid:             topic's human id
// - parent_post_id:  `_id` of the parent post
// - section_hid:     id of the current section
//
var editorState = {};


// helper to destroy editor & free resourses
// - dropDraft:       true to delete draft, autosave in other case
//
function removeEditor(dropDraft) {
  if (dropDraft) {
    // just remove draft text
    draft.remove(editorState.draft_id);
  } else {
    if (editorState.editor && editorState.editor.isDirty()) {
      // text is edited
      if (editorState.editor.value()) {
        // editor has text, need to save it
        draft.save(editorState.draft_id, editorState.editor.value());
      } else {
        // If content empty - cleanup draft key, don't store empty records
        draft.save(editorState.draft_id);
      }
    }
  }

  // cleanup
  if (editorState.$form) {
    editorState.$form.remove();
  }
  if (editorState.editor) {
    editorState.editor.remove();
  }
  editorState = {};
}


// init on page load and destroy editor on window unload
//
N.wire.on('navigate.done:forum.topic', function (data) {

  editorState.hid = +data.params.hid;
  editorState.section_hid = +data.params.section_hid;

  $(window).on('beforeunload', removeEditor);
});


// free resources on page exit
//
N.wire.before('navigate.exit:forum.topic', function () {
  removeEditor();

  $(window).off('beforeunload', removeEditor);
});


// click on post reply link or toolbar reply button
//
N.wire.on('forum.post.reply', function (event) {
  var $button = $(event.currentTarget),
    button_offset = $button.offset().top,
    parent_post_id = $button.data('post-id') || 0;

  // Check if previous editor exists
  if (editorState.$form) {
    // If already writing reply to this post, then nothing to do
    if (parent_post_id === editorState.parent_post_id) {
      return;
    }
    removeEditor();
  }

  N.loader.loadAssets('editor', function () {

    editorState.parent_post_id = parent_post_id;

    // draft id = 'forum:reply:<section_hid>:<topic_hid>:<post_id>'
    editorState.draft_id = 'forum:reply:' + editorState.section_hid + ':' +
      editorState.hid + ':' + parent_post_id;

    // Create editing form instance
    editorState.$form = $(N.runtime.render('forum.topic.reply'));
    editorState.$form.hide();

    var $parent_post;

    // Find parent, to attach editor after. For new reply - last child
    if (editorState.parent_post_id) {
      $parent_post = $('#post' + editorState.parent_post_id);
    } else {
      $parent_post = $('#postlist > :last');
    }

    // Insert editing form after editor post
    $parent_post.after(editorState.$form);

    // Initialize editable area
    var Editor = require('editor');
    editorState.editor = new Editor();
    editorState.editor.attach(editorState.$form.find('.forum-reply__editor'));

    // Load draft if exists
    editorState.editor.value(draft.find(editorState.draft_id) || '');

    // Show form
    editorState.$form.fadeIn();

    // Fix scroll
    $('html,body').animate({scrollTop: '+=' + ($button.offset().top - button_offset)}, 0);
  });
});


// event handler on Save button click
//
N.wire.on('forum.post.reply.save', function () {
  // Save reply on server
  var post = {
    topic_hid: editorState.hid,
    format: 'txt',
    text: editorState.editor.value()
  };

  post.to_id = editorState.parent_post_id;

  N.io.rpc('forum.topic.reply', post, function (err, env) {
    if (err) {
      return;
    }

    var locals = {
      topic: editorState,
      section: {
        hid: editorState.section_hid
      },
      posts: env.posts,
      users: env.users,
      settings: {}
    };

    _.each(locals.posts, function(post){
      post.ts = new Date(post.ts);
    });

    // Render new post
    var $result = $(N.runtime.render('forum.blocks.posts_list', locals)).hide();

    // Append new post
    $('#postlist > :last').after($result);

    $result.fadeIn();

    removeEditor(true);
  });
});


// on Cancel button remove editor and store draft
//
N.wire.on('forum.post.reply.cancel', function () {
  editorState.$form.fadeOut(function () {
    removeEditor();
  });
});


// terminate editor if user tries to edit post on the same page
//
N.wire.on('forum.post.edit', function () {
  removeEditor();
});
