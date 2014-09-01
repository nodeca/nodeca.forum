// Create reply form and load data from server

'use strict';

var _          = require('lodash');
var medialinks = require('nodeca.core/lib/parser/medialinks');

var $form;
var pageParams;
var parentPostId;
var $preview;
var parseRules;


function removeEditor() {
  if (!$form) {
    return;
  }

  // TODO: save draft
  $form.remove();
  $form = null;
  $preview = null;
}


function updatePreview() {
  if (!$preview) {
    return;
  }

  var mdData = { input: $form.find('textarea').val(), output: null };

  N.parser.md2src(mdData, function () {
    var parserData = {
      input: mdData.output,
      output: null,
      options: parseRules
    };

    N.parser.src2ast(parserData, function () {
      $preview.html(parserData.output.html());
    });
  });
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


  // Load parser
  //
  N.wire.before('forum.topic.post_reply', function load_parser(event, callback) {
    N.loader.loadAssets('parser', callback);
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

    $form.fadeIn();

    $form.find('textarea').on('input propertychange', _.debounce(updatePreview, 500));
  });


  ///////////////////////////////////////////////////////////////////////////////
  // Event handler on Save button click
  //
  N.wire.on('forum.topic.post_reply:save', function save() {
    // Save reply on server

    var mdData = { input: $form.find('textarea').val(), output: null };

    N.parser.md2src(mdData, function () {
      var data = {
        section_hid: pageParams.section_hid,
        topic_hid:   pageParams.hid,
        post_text:   mdData.output
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
