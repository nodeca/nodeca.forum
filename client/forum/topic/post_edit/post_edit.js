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
  N.wire.on('forum.topic.post_edit:opt_medialinks', function opt_medialinks(event) {
    postOptions.no_mlinks = !$(event.target).prop('checked');
    updatePostOptions();
  });


  // Change convert smiles option
  //
  N.wire.on('forum.topic.post_edit:opt_smiles', function opt_smiles(event) {
    postOptions.no_smiles = !$(event.target).prop('checked');
    updatePostOptions();
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

    asModerator = $button.data('as-moderator') || false;
    postId = $button.data('post-id');

    var $targetPost = $('#post' + postId);

    N.io.rpc('forum.topic.post.edit.index', { post_id: postId, as_moderator: asModerator })
      .done(function (res) {
        parseOptions = res.params;

        $form = $(N.runtime.render('forum.topic.post_edit', { user: res.users[res.user_id] }));
        $form.hide(0);

        $targetPost.after($form);

        postOptions = {
          no_mlinks: !parseOptions.medialinks,
          no_smiles: false // TODO
        };

        $('.forum-edit__medialinks').prop('checked', !postOptions.no_mlinks);
        $('.forum-edit__smiles').prop('checked', !postOptions.no_smiles);

        editor = new N.MDEdit({
          editArea: '.forum-edit__editor',
          previewArea: '.forum-edit__preview',
          parseOptions: {},
          attachments: res.attachments,
          text: res.md
        });

        updatePostOptions();

        $targetPost.fadeOut('fast', function () {
          $form.fadeIn('fast');

          // Scroll page to opened form
          var editorPosition = $form.offset().top - $('#content').offset().top;

          if ($(window).scrollTop() > editorPosition) {
            $('html, body').animate({ scrollTop: editorPosition }, 'fast');
          }
        });
      });
  });


  ///////////////////////////////////////////////////////////////////////////////
  // Event handler on Save button click
  //
  N.wire.on('forum.topic.post_edit:save', function save() {

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
