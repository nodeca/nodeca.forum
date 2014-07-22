// Forum Topic post edit logic
//

'use strict';

var $form;
var pageParams;
var postId;


function removeEditor() {
  if (!$form) {
    return;
  }

  $form.remove();
  $form = null;
}


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


// Click on post edit link
//
N.wire.on('forum.post.edit', function click_edit(event) {
  removeEditor();

  var $button = $(event.target);

  postId = $button.data('post-id');

  var $targetPost = $('#post' + postId);

  $form = $(N.runtime.render('forum.topic.edit'));
  $form.hide();

  var params = {
    post_id: postId,
    section_hid: pageParams.section_hid,
    topic_hid: pageParams.hid
  };

  N.io.rpc('forum.topic.edit', params).done(function (res) {
    // TODO: src html to markdown
    $form.find('textarea').val(res.src);

    // Insert editing form after editor post
    $targetPost.after($form);
    $form.fadeIn();
  });
});


// Event handler on Save button click
//
N.wire.on('forum.post.edit.save', function save() {

  // TODO: markdown to src html
  var params = {
    post_id: postId,
    section_hid: pageParams.section_hid,
    post_text: $form.find('textarea').val(),
    topic_hid: pageParams.hid
  };

  N.io.rpc('forum.topic.edit', params).done(function (res) {
    $form.fadeOut(function () {
      removeEditor();
      $('#post' + postId + ' .forum-post__message').html(res.html);
    });
  });
});


// On Cancel button remove editor
//
N.wire.on('forum.post.edit.cancel', function cancel() {
  $form.fadeOut(function () {
    removeEditor();
  });
});


// Terminate editor if user tries to reply post on the same page
//
N.wire.on('forum.post.reply', function click_reply() {
  removeEditor();
});
