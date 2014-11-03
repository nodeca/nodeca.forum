// Forum Topic post edit logic
//

'use strict';

var _ = require('lodash');

var medialinks = require('nodeca.core/lib/parser/medialinks');

var $form;
var postId;
var moderatorAction;
var parseRules;
var editor;
var postOptions;


function removeEditor() {
  if (!$form) {
    return;
  }

  $form.remove();
  $form = null;
}


// Update post options
//
function updatePostOptions() {
  var rules = {
    cleanupRules: parseRules.cleanupRules,
    smiles: {},
    medialinkProviders: []
  };

  if (!postOptions.no_mlinks) {
    rules.medialinkProviders = parseRules.medialinkProviders;
  }

  if (!postOptions.no_smiles) {
    rules.smiles = parseRules.smiles;
  }

  editor.setOptions({ parseRules: rules });
}

// TODO: draft


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
    $('.forum-edit__preview').slideToggle();
  });


  // Show/hide post options
  //
  N.wire.on('forum.topic.post_edit:options', function toggle_options() {
    $('.forum-edit__options').slideToggle();
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

    moderatorAction = $button.data('moderator-action') || false;
    postId = $button.data('post-id');

    var $targetPost = $('#post' + postId);

    $form = $(N.runtime.render('forum.topic.post_edit'));
    $form.hide();

    $targetPost.after($form);

    N.io.rpc('forum.topic.post_edit.fetch', { post_id: postId, moderator_action: moderatorAction })
      .done(function (res) {
        postOptions = res.params;

        $('.forum-edit__medialinks').prop('checked', !postOptions.no_mlinks);
        $('.forum-edit__smiles').prop('checked', !postOptions.no_smiles);

        editor = new N.MDEdit({
          editArea: '.forum-edit__editor',
          previewArea: '.forum-edit__preview',
          parseRules: parseRules,
          toolbarButtons: '$$ JSON.stringify(N.config.mdedit.toolbar) $$',
          attachments: res.attach_tail,
          markdown: res.md
        });

        updatePostOptions();

        $form.fadeIn();
      });
  });


  ///////////////////////////////////////////////////////////////////////////////
  // Event handler on Save button click
  //
  N.wire.on('forum.topic.post_edit:save', function save() {

    var $post = $('#post' + postId);

    var data = {
      moderator_action: moderatorAction,
      post_id:          postId,
      post_md:          editor.markdown,
      attach_tail:      _.map(editor.attachments, function (v) { return v.file_id; }),
      option_no_mlinks: postOptions.no_mlinks,
      option_no_smiles: postOptions.no_smiles
    };

    N.io.rpc('forum.topic.post_edit.save', data).done(function (res) {
      $form.fadeOut();
      removeEditor();

      $post.find('.forum-post__message').html(res.post.html);
      $post.find('.attachments').replaceWith(
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
    $form.fadeOut(function () {
      removeEditor();
    });
  });

});
