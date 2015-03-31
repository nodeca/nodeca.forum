// Forum Topic post edit logic
//

'use strict';

var _ = require('lodash');

var $form;
var postId;
var asModerator;
var parseOptions;
var editor;
var postOptions;
var rpcResult;


function removeEditor() {
  if (!$form) {
    return;
  }

  $form.remove();
  $form = null;
  $('#post' + postId).fadeIn('fast');
}


// Update post options
//
function updatePostOptions() {
  editor.setOptions({
    parseOptions: _.assign({}, parseOptions, {
      medialinks: postOptions.no_mlinks ? false : parseOptions.medialinks,
      smiles: postOptions.no_smiles ? false : parseOptions.smiles
    })
  });
}


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

  // Show/hide post preview
  //
  N.wire.on('forum.topic.post_edit:preview_toggle', function toggle_options() {
    $('.forum-edit__preview').slideToggle('fast');
  });


  // Show/hide post options
  //
  N.wire.on('forum.topic.post_edit:options', function toggle_options() {
    $('.forum-edit__options').slideToggle('fast');
  });


  // Change convert medialinks option
  //
  N.wire.on('forum.topic.post_edit:opt_medialinks', function opt_medialinks(data) {
    postOptions.no_mlinks = !data.$this.prop('checked');
    updatePostOptions();
  });


  // Change convert smiles option
  //
  N.wire.on('forum.topic.post_edit:opt_smiles', function opt_smiles(data) {
    postOptions.no_smiles = !data.$this.prop('checked');
    updatePostOptions();
  });


  ///////////////////////////////////////////////////////////////////////////////
  // Click on post edit link
  //

  // Hide target post and display editor instead of it
  //
  N.wire.on('forum.topic.post_edit', function create_editor_form(data, callback) {
    removeEditor();

    asModerator = data.$this.data('as-moderator') || false;
    postId = data.$this.data('post-id');

    N.io.rpc('forum.topic.post.edit.index', { post_id: postId, as_moderator: asModerator })
        .done(function (res) {

      var $targetPost = $('#post' + postId);

      parseOptions = res.params;

      $form = $(N.runtime.render('forum.topic.post_edit', { user: res.users[res.user_id] }));
      $targetPost.after($form);
      $form.hide(0);

      postOptions = {
        no_mlinks: !parseOptions.medialinks,
        no_smiles: false // TODO
      };

      rpcResult = res;

      $targetPost.fadeOut('fast', function () {
        $form.fadeIn('fast');

        // Scroll page to opened form
        var editorPosition = $form.offset().top - $('#content').offset().top;

        if ($(window).scrollTop() > editorPosition) {
          $('html, body').animate({ scrollTop: editorPosition }, 'fast');
        }
      });

      callback();
    });
  });

  // Load editor and parser
  //
  N.wire.on('forum.topic.post_edit', function load_editor(data, callback) {
    N.loader.loadAssets('mdedit', callback);
  });

  // Replace placeholder div with the real editor
  //
  N.wire.on('forum.topic.post_edit', function initialize_editor() {
    $('.forum-edit__medialinks').prop('checked', !postOptions.no_mlinks);
    $('.forum-edit__smiles').prop('checked', !postOptions.no_smiles);

    editor = new N.MDEdit({
      editArea: '.forum-edit__editor',
      previewArea: '.forum-edit__preview',
      parseOptions: {},
      attachments: rpcResult.attachments,
      text: rpcResult.md
    });

    updatePostOptions();
  });


  ///////////////////////////////////////////////////////////////////////////////
  // Event handler on Save button click
  //
  N.wire.on('forum.topic.post_edit:save', function save() {
    if (!editor) {
      // user clicks "save" when editor isn't loaded yet
      return;
    }

    var $post = $('#post' + postId);

    var data = {
      as_moderator:     asModerator,
      post_id:          postId,
      txt:              editor.text(),
      attach:           editor.attachments(),
      option_no_mlinks: postOptions.no_mlinks,
      option_no_smiles: postOptions.no_smiles
    };

    N.io.rpc('forum.topic.post.edit.update', data).done(function (res) {
      $form.fadeOut('fast');
      removeEditor();

      $post.find('.forum-post__message').html(res.post.html);
      $post.find('.forum-post__tail').replaceWith(
        N.runtime.render('forum.blocks.posts_list.attachments', {
          post: res.post,
          user: { hid: $post.data('user-hid') }
        })
      );
    });
  });


  // On Cancel button remove editor
  //
  N.wire.on('forum.topic.post_edit:cancel', function cancel() {
    $form.fadeOut('fast', function () {
      removeEditor();
    });
  });

});
