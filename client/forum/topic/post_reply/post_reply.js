// Create reply form and load data from server

'use strict';

var _          = require('lodash');

var medialinks = require('nodeca.core/lib/parser/medialinks');
var Bag        = require('bag.js');

var bag = new Bag({ prefix: 'nodeca_drafts' });
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
    'post_reply',
    // topic hid
    pageParams.hid,
    N.runtime.user_hid
  ].join('_');
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

    N.io.rpc('forum.topic.post.options').done(function (res) {
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


  // Remove old form if editor already open
  //
  N.wire.before('forum.topic.post_reply', function load_editor() {
    removeEditor();
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

      if (!postOptions.no_mlinks) {
        rules.medialinkProviders = parseRules.medialinkProviders;
      }

      if (!postOptions.no_smiles) {
        rules.smiles = parseRules.smiles;
      }

      editor.setOptions({ parseRules: rules });
    }

    $options.find('.forum-reply__medialinks').change(function () {

      postOptions.no_mlinks = !$(this).prop('checked');
      updateOptions();
    });

    $options.find('.forum-reply__smiles').change(function () {

      postOptions.no_smiles = !$(this).prop('checked');
      updateOptions();
    });

    $options.slideToggle('fast');
  });


  // Click on post reply link or toolbar reply button
  //
  N.wire.on('forum.topic.post_reply', function click_reply(event) {
    parentPostId = $(event.target).data('post-id');

    $form = $(N.runtime.render('forum.topic.post_reply'));
    $form.hide('fast');

    $preview = $form.find('.forum-reply__preview');

    $form.find('.forum-reply__medialinks').prop('checked', !postOptions.no_mlinks);
    $form.find('.forum-reply__smiles').prop('checked', !postOptions.no_smiles);

    // Find parent, to attach editor after. For new reply - last child
    if (parentPostId) {
      $('#post' + parentPostId).after($form);
    } else {
      $('#postlist > :last').after($form);
    }

    bag.get(draftID(), function (__, data) {

      editor = new N.MDEdit({
        editArea: '.forum-reply__editor',
        previewArea: '.forum-reply__preview',
        parseRules: parseRules,
        toolbarButtons: '$$ JSON.stringify(N.config.mdedit.toolbar) $$',
        markdown: data ? data.md : '',
        attachments: data ? data.attachments : [],
        onChange: _.debounce(function () {
          bag.set(draftID(), { md: editor.ace.getValue(), attachments: editor.attachments });
        }, 500)
      });

    });

    $form.fadeIn('fast');

    if (!parentPostId) {
      // Scroll page to opened form
      $('html, body').animate({ scrollTop: $form.offset().top - $('#content').offset().top }, 'fast');
    }
  });


  ///////////////////////////////////////////////////////////////////////////////
  // Event handler on Save button click
  //
  N.wire.on('forum.topic.post_reply:save', function save() {
    // Save reply on server

    var data = {
      section_hid:     pageParams.section_hid,
      topic_hid:       pageParams.hid,
      post_md:         editor.markdown,
      attach_tail:     _.map(editor.attachments, function (v) { return v.media_id; }),
      option_no_mlinks: postOptions.no_mlinks,
      option_no_smiles: postOptions.no_smiles
    };

    if (parentPostId) {
      data.parent_post_id = parentPostId;
    }

    N.io.rpc('forum.topic.post.reply.create', data).done(function (res) {
      removeEditor();

      bag.remove(draftID(), function () {

        // TODO: append new posts
        window.location = res.redirect_url;
      });
    });

  });


  N.wire.on('forum.topic.post_reply:preview_toggle', function preview_toggle() {
    $preview.slideToggle('fast');
    // TODO: save preview visibility
  });


  // on Cancel button remove editor and remove draft
  //
  N.wire.on('forum.topic.post_reply:cancel', function cancel() {
    bag.remove(draftID(), function () {
      $form.fadeOut('fast', function () {
        removeEditor();
      });
    });
  });

});
