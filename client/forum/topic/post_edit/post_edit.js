// Forum Topic post edit logic
//

'use strict';

var _          = require('lodash');
var medialinks = require('nodeca.core/lib/parser/medialinks');


var $form;
var $preview;
var pageParams;
var postId;
var parseRules;
var parser;


function removeEditor() {
  if (!$form) {
    return;
  }

  $form.remove();
  $form = null;
  $preview = null;
}


function updatePreview() {
  if (!$preview) {
    return;
  }

  var mdData = { input: $form.find('textarea').val(), output: null };

  parser.md2src(mdData, function () {
    var parserData = {
      input: mdData.output,
      output: null,
      options: parseRules
    };

    parser.src2ast(parserData, function () {
      $preview.html(parserData.output.html());
    });
  });
}


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

    N.io.rpc('forum.topic.parse_rules').done(function (res) {
      parseRules = res.parse_rules;
      parseRules.medialinkProviders = medialinks(parseRules.medialinks.providers, parseRules.medialinks.content, true);
      callback();
    });
  });


  // Load parser
  //
  N.wire.before('forum.topic.post_edit', function load_parser(event, callback) {
    N.loader.loadAssets('parser', callback);
  });


  ///////////////////////////////////////////////////////////////////////////////
  // Click on post edit link
  //
  N.wire.on('forum.topic.post_edit', function click_edit(event) {
    removeEditor();

    var Parser = require('ndparser');
    parser = new Parser();

    var $button = $(event.target);

    postId = $button.data('post-id');

    var $targetPost = $('#post' + postId);

    $form = $(N.runtime.render('forum.topic.post_edit'));
    $form.hide();

    $preview = $form.find('.forum-reply__preview');

    var params = {
      post_id: postId,
      section_hid: pageParams.section_hid,
      topic_hid: pageParams.hid
    };

    N.io.rpc('forum.topic.post_edit', params).done(function (res) {
      // TODO: src html to markdown

      var srcData = { input: res.src, output: null };

      parser.src2md(srcData, function () {
        $form.find('textarea').val(srcData.output);

        // Insert editing form after editor post
        $targetPost.after($form);
        $form.fadeIn();

        updatePreview();
        $form.find('textarea').on('input propertychange', _.debounce(updatePreview, 500));
      });
    });
  });


  ///////////////////////////////////////////////////////////////////////////////
  // Event handler on Save button click
  //
  N.wire.on('forum.topic.post_edit:save', function save() {

    var mdData = { input: $form.find('textarea').val(), output: null };

    parser.md2src(mdData, function () {

      var params = {
        post_id: postId,
        section_hid: pageParams.section_hid,
        post_text: mdData.output,
        topic_hid: pageParams.hid
      };

      N.io.rpc('forum.topic.post_edit', params).done(function (res) {
        $form.fadeOut();
        removeEditor();
        $('#post' + postId + ' .forum-post__message').html(res.html);
      });
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
