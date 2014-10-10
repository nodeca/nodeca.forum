// Create reply form and load data from server

'use strict';

var medialinks = require('nodeca.core/lib/parser/medialinks');

var bag = new window.Bag();
var $form;
var pageParams;
var parentPostId;
var $preview;
var parseRules;
var editor;
var postOptions;


function removeEditor() {
  if (!$form) {
    return;
  }

  $form.remove();
  $form = null;
  $preview = null;
  editor = null;
}


function draftID() {
  return [
    'reply',
    parentPostId,
    pageParams.section_hid,
    pageParams.hid
  ].join('_');
}


///////////////////////////////////////////////////////////////////////////////
// Init on page load
//
N.wire.on('navigate.done:forum.topic', function init_forum_post_reply(data) {
  pageParams = data.params;
});


// Free resources and save draft on page exit
//
N.wire.before('navigate.exit:forum.topic', function tear_down_forum_post_reply() {
  if (!$form) {
    return;
  }

  bag.set(draftID(), editor.ace.getValue(), function () {
    removeEditor();
  });
});


// terminate editor if user tries to edit post on the same page
//
N.wire.on('forum.topic.post_edit', function click_edit() {
  if (!$form) {
    return;
  }

  bag.set(draftID(), editor.ace.getValue(), function () {
    removeEditor();
  });
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

    N.io.rpc('forum.topic.post_options').done(function (res) {
      parseRules = res.parse_rules;
      parseRules.medialinkProviders = medialinks(parseRules.medialinks.providers, parseRules.medialinks.content, true);

      postOptions = res.post_options;
      callback();
    });
  });


  // Load editor
  //
  N.wire.before('forum.topic.post_reply', function load_editor(event, callback) {
    N.loader.loadAssets('mdedit', callback);
  });


  // Save draft and remove old form if editor already open
  //
  N.wire.before('forum.topic.post_reply', function load_editor(event, callback) {
    if ($form) {
      bag.set(draftID(), editor.ace.getValue(), function () {
        removeEditor();
        callback();
      });

      return;
    }

    callback();
  });


  // Click on options button
  //
  N.wire.on('forum.topic.post_reply:options', function click_options() {
    var $options = $form.find('.forum-reply__options');

    function updateOptions() {

      var rules = {
        cleanupRules: parseRules.cleanupRules,
        smiles: {},
        medialinkProviders: []
      };

      if (!postOptions.nomlinks) {
        rules.medialinkProviders = parseRules.medialinkProviders;
      }

      if (!postOptions.nosmiles) {
        rules.smiles = parseRules.smiles;
      }

      editor.setOptions({ parseRules: rules });
      editor.updatePreview();
    }

    $options.find('.forum-reply__medialinks').change(function () {

      postOptions.nomlinks = !$(this).prop('checked');
      updateOptions();
    });

    $options.find('.forum-reply__smiles').change(function () {

      postOptions.nosmiles = !$(this).prop('checked');
      updateOptions();
    });

    $options.toggle();
  });


  // Click on post reply link or toolbar reply button
  //
  N.wire.on('forum.topic.post_reply', function click_reply(event) {
    parentPostId = $(event.target).data('post-id');

    $form = $(N.runtime.render('forum.topic.post_reply'));
    $form.hide();

    $preview = $form.find('.forum-reply__preview');

    $form.find('.forum-reply__medialinks').prop('checked', !postOptions.nomlinks);
    $form.find('.forum-reply__smiles').prop('checked', !postOptions.nosmiles);

    // Find parent, to attach editor after. For new reply - last child
    if (parentPostId) {
      $('#post' + parentPostId).after($form);
    } else {
      $('#postlist > :last').after($form);
    }

    editor = new N.MDEdit({
      editArea: '.forum-reply__editor',
      previewArea: '.forum-reply__preview',
      parseRules: parseRules,
      toolbarButtons: '$$ JSON.stringify(N.config.mdedit.toolbar) $$'
    });


    bag.get(draftID(), function (err, data) {
      if (err) {
        return;
      }

      editor.ace.setValue(data);
    });


    $form.fadeIn();

  });


  ///////////////////////////////////////////////////////////////////////////////
  // Event handler on Save button click
  //
  N.wire.on('forum.topic.post_reply:save', function save() {
    // Save reply on server

    var data = {
      section_hid:     pageParams.section_hid,
      topic_hid:       pageParams.hid,
      post_md:         editor.ace.getValue(),
      attach_tail:     editor.attachments,
      option_nomlinks: postOptions.nomlinks,
      option_nosmiles: postOptions.nosmiles
    };

    if (parentPostId) {
      data.parent_post_id = parentPostId;
    }

    N.io.rpc('forum.topic.post_reply.save', data).done(function (res) {
      removeEditor();

      bag.remove(draftID(), function () {

        // TODO: append new posts
        window.location = res.redirect_url;
      });
    });

  });


  N.wire.on('forum.topic.post_reply:preview_toggle', function preview_toggle() {
    $preview.fadeToggle();
    // TODO: save preview visibility
  });


  // on Cancel button remove editor and remove draft
  //
  N.wire.on('forum.topic.post_reply:cancel', function cancel() {
    bag.remove(draftID(), function () {
      $form.fadeOut(function () {
        removeEditor();
      });
    });
  });

});
