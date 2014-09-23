// Create reply form and load data from server

'use strict';

var medialinks = require('nodeca.core/lib/parser/medialinks');

var $form;
var pageParams;
var parentPostId;
var $preview;
var parseRules;
var editor;


function removeEditor() {
  if (!$form) {
    return;
  }

  // TODO: save draft
  $form.remove();
  $form = null;
  $preview = null;
  editor = null;
}


///////////////////////////////////////////////////////////////////////////////
// Init on page load
//
N.wire.on('navigate.done:forum.topic', function init_forum_post_reply(data) {
  pageParams = data.params;
});


// Free resources on page exit
//
N.wire.before('navigate.exit:forum.topic', function tear_down_forum_post_reply() {
  removeEditor();
});

// terminate editor if user tries to edit post on the same page
//
N.wire.on('forum.topic.post_edit', function click_edit() {
  removeEditor();
});


N.wire.once('navigate.done:forum.topic', function page_once() {

  ///////////////////////////////////////////////////////////////////////////////
  // Fetch parse rules
  //
  N.wire.before('forum.topic.post_reply', function fetch_parse_rules(event, callback) {
    if (parseRules) {
      callback();
      return;
    }

    N.io.rpc('forum.topic.parse_rules').done(function (res) {
      parseRules = res.parse_rules;
      parseRules.medialinkProviders = medialinks(parseRules.medialinks.providers, parseRules.medialinks.content, true);
      callback();
    });
  });


  // Load editor
  //
  N.wire.before('forum.topic.post_reply', function load_editor(event, callback) {
    N.loader.loadAssets('mdedit', callback);
  });


  // Click on post reply link or toolbar reply button
  //
  N.wire.on('forum.topic.post_reply', function click_reply(event) {
    removeEditor();

    // TODO: load draft

    parentPostId = $(event.target).data('post-id');

    $form = $(N.runtime.render('forum.topic.post_reply'));
    $form.hide();

    $preview = $form.find('.forum-reply__preview');

    // Find parent, to attach editor after. For new reply - last child
    if (parentPostId) {
      $('#post' + parentPostId).after($form);
    } else {
      $('#postlist > :last').after($form);
    }

    editor = new N.MDEdit({
      editor_area: '.forum-reply__editor',
      preview_area: '.forum-reply__preview',
      parse_rules: parseRules
    });

    $form.fadeIn();

  });


  ///////////////////////////////////////////////////////////////////////////////
  // Event handler on Save button click
  //
  N.wire.on('forum.topic.post_reply:save', function save() {
    // Save reply on server

    editor.getSrc(function (src) {
      var data = {
        section_hid: pageParams.section_hid,
        topic_hid:   pageParams.hid,
        post_text:   src
      };

      if (parentPostId) {
        data.parent_post_id = parentPostId;
      }

      N.io.rpc('forum.topic.post_reply.save', data).done(function (res) {
        removeEditor();
        // TODO: remove draft

        // TODO: append new posts
        window.location = res.redirect_url;
      });
    });
  });


  N.wire.on('forum.topic.post_reply:preview_toggle', function preview_toggle() {
    $preview.fadeToggle();
    // TODO: save preview visibility
  });


  // on Cancel button remove editor and store draft
  //
  N.wire.on('forum.topic.post_reply:cancel', function cancel() {
    $form.fadeOut(function () {
      removeEditor();
    });
  });

});
