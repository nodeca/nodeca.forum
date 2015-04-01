// Create reply form and load data from server

'use strict';

var _ = require('lodash');

var Bag = require('bag.js');

var bag = new Bag({ prefix: 'nodeca_drafts' });
var $form;
var pageParams;
var parentPostId;
var $preview;
var parseOptions;
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
    pageParams.topic_hid,
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
  // Click on post reply link or toolbar reply button

  // Create new editor form and add it to the page
  //
  N.wire.before('forum.topic.post_reply', function create_editor_form(data) {
    // remove old editor form if opened
    removeEditor();

    $form = $(N.runtime.render('forum.topic.post_reply'));

    parentPostId = data.$this.data('post-id');

    // Find parent, to attach editor after. For new reply - last child
    if (parentPostId) {
      $('#post' + parentPostId).after($form);
    } else {
      $('#postlist > :last').after($form);
    }

    $form.hide(0);
    $form.fadeIn('fast');

    if (!parentPostId) {
      // Scroll page to opened form
      $('html, body').animate({ scrollTop: $form.offset().top - $('#content').offset().top }, 'fast');
    }
  });

  // Fetch parse rules
  //
  N.wire.before('forum.topic.post_reply', function fetch_parse_rules(data, callback) {
    N.io.rpc('forum.topic.post.options').done(function (res) {
      parseOptions = res.parse_options;
      postOptions = res.post_options;
      callback();
    });
  });


  // Load editor
  //
  N.wire.before('forum.topic.post_reply', function load_editor(data, callback) {
    N.loader.loadAssets('mdedit', callback);
  });


  // Click on options button
  //
  N.wire.on('forum.topic.post_reply:options', function click_options() {
    var $options = $form.find('.forum-reply__options');

    function updateOptions() {
      editor.setOptions({
        parseOptions: _.assign({}, parseOptions, {
          medialinks: postOptions.no_mlinks ? false : parseOptions.medialinks,
          smiles: postOptions.no_smiles ? false : parseOptions.smiles
        })
      });
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


  var draft;

  // Fetch draft data
  //
  N.wire.before('forum.topic.post_reply', function fetch_draft(__, callback) {
    draft = {
      text: '',
      attachments: []
    };

    bag.get(draftID(), function (__, data) {

      if (!data) {
        callback();
        return;
      }

      draft.text = data.text || '';

      if (!data.attachments || data.attachments.length === 0) {
        callback();
        return;
      }

      var params = {
        media_ids: _.pluck(data.attachments, 'media_id')
      };

      N.io.rpc('forum.topic.attachments_check', params).done(function (res) {
        draft.attachments = data.attachments.filter(function (attach) {
          return res.media_ids.indexOf(attach.media_id) !== -1;
        });

        callback();
      });
    });
  });


  // Replace placeholder div with the real editor
  //
  N.wire.on('forum.topic.post_reply', function initialize_editor() {
    $preview = $form.find('.forum-reply__preview');

    $form.find('.forum-reply__medialinks').prop('checked', !postOptions.no_mlinks);
    $form.find('.forum-reply__smiles').prop('checked', !postOptions.no_smiles);

    editor = new N.MDEdit({
      editArea: '.forum-reply__editor',
      previewArea: '.forum-reply__preview',
      parseOptions: _.assign({}, parseOptions, {
        medialinks: postOptions.no_mlinks ? false : parseOptions.medialinks,
        smiles: postOptions.no_smiles ? false : parseOptions.smiles
      }),
      text: draft.text,
      attachments: draft.attachments,
      onChange: _.debounce(function () {
        bag.set(draftID(), {
          text: editor.text(),
          attachments: editor.attachments()
        });
      }, 500)
    });

    draft = null;
  });


  ///////////////////////////////////////////////////////////////////////////////
  // Event handler on Save button click
  //
  N.wire.on('forum.topic.post_reply:save', function save() {
    if (!editor) {
      // user clicks "save" when editor isn't loaded yet
      return;
    }

    // Save reply on server

    var data = {
      section_hid:      pageParams.section_hid,
      topic_hid:        pageParams.topic_hid,
      txt:              editor.text(),
      attach:           editor.attachments(),
      option_no_mlinks: postOptions.no_mlinks,
      option_no_smiles: postOptions.no_smiles
    };

    if (parentPostId) {
      data.parent_post_id = parentPostId;
    }

    N.io.rpc('forum.topic.post.reply', data).done(function (res) {
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
