// Forum Topic post edit logic
//

'use strict';

var medialinks = require('nodeca.core/lib/parser/medialinks');


var $form;
var pageParams;
var postId;
var parseRules;
var editor;


function removeEditor() {
  if (!$form) {
    return;
  }

  $form.remove();
  $form = null;
}

// TODO: draft

///////////////////////////////////////////////////////////////////////////////
// Init on page load
//
N.wire.on('navigate.done:forum.topic', function init_forum_post_edit(data) {
  pageParams = data.params;
});


// Free resources on page exit
//
N.wire.on('navigate.exit:forum.topic', function tear_down_forum_post_edit() {
  removeEditor();
});


// Terminate editor if user tries to reply post on the same page
//
N.wire.on('forum.topic.post_reply', function click_reply() {
  removeEditor();
});


N.wire.once('navigate.done:forum.topic', function page_once() {

  ///////////////////////////////////////////////////////////////////////////////
  // Fetch parse rules
  //
  N.wire.before('forum.topic.post_edit', function fetch_parse_rules(event, callback) {
    if (parseRules) {
      callback();
      return;
    }

    N.io.rpc('forum.topic.post_options').done(function (res) {
      parseRules = res.parse_rules;
      parseRules.medialinkProviders = medialinks(parseRules.medialinks.providers, parseRules.medialinks.content, true);
      callback();
    });
  });


  // Load parser
  //
  N.wire.before('forum.topic.post_edit', function load_parser(event, callback) {
    N.loader.loadAssets('mdedit', callback);
  });


  ///////////////////////////////////////////////////////////////////////////////
  // Click on post edit link
  //
  N.wire.on('forum.topic.post_edit', function click_edit(event) {
    removeEditor();

    var $button = $(event.target);

    postId = $button.data('post-id');

    var $targetPost = $('#post' + postId);

    $form = $(N.runtime.render('forum.topic.post_edit'));
    $form.hide();

    $targetPost.after($form);

    editor = new N.MDEdit({
      editArea: '.forum-edit__editor',
      previewArea: '.forum-edit__preview',
      parseRules: parseRules,
      toolbarButtons: '$$ JSON.stringify(N.config.mdedit.toolbar) $$'
    });

    N.io.rpc('forum.topic.post_edit.fetch', { post_id: postId }).done(function (res) {
      editor.attachments = res.attach_tail;
      editor.ace.setValue(res.md);

      editor.updatePreview();
      editor.updateAttachments();

      $form.fadeIn();
    });
  });


  ///////////////////////////////////////////////////////////////////////////////
  // Event handler on Save button click
  //
  N.wire.on('forum.topic.post_edit:save', function save() {

    // TODO: implement save
    N.io.rpc('forum.topic.post_edit.save', pageParams).done(function (res) {
      $form.fadeOut();
      removeEditor();
      $('#post' + postId + ' .forum-post__message').html(res.html);
    });
  });


  // On Cancel button remove editor
  //
  N.wire.on('forum.topic.post_edit:cancel', function cancel() {
    $form.fadeOut(function () {
      removeEditor();
    });
  });

});
