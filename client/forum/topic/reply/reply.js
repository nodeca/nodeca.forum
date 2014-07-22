// Forum Topic post reply logic
//

'use strict';

var _        = require('lodash');
var remarked = require('remarked');

var $form;
var pageParams;
var parentPostId;
var $preview;


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

  remarked.setOptions({
    gfm: false,
    tables: false,
    breaks: false,
    pedantic: false,
    sanitize: true,
    smartLists: true,
    smartypants: false
  });

  // TODO: generate real preview
  var Parser = require('ndparser');
  var parser = new Parser();

  var data = {
    input: remarked($form.find('textarea').val()),
    output: null,
    options: {}
  };

  parser.src2ast(data, function () {
    $preview.html(data.output.html());
  });
}


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


// Load parser
//
N.wire.before('forum.post.reply', function load_parser(event, callback) {
  N.loader.loadAssets('parser', callback);
});


// Click on post reply link or toolbar reply button
//
N.wire.on('forum.post.reply', function click_reply(event) {
  removeEditor();

  // TODO: load draft

  parentPostId = $(event.target).data('post-id');

  $form = $(N.runtime.render('forum.topic.reply'));
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


// Event handler on Save button click
//
N.wire.on('forum.post.reply.save', function save() {
  // Save reply on server

  remarked.setOptions({
    gfm: false,
    tables: false,
    breaks: false,
    pedantic: false,
    sanitize: true,
    smartLists: true,
    smartypants: false
  });

  var data = {
    section_hid: pageParams.section_hid,
    topic_hid:   pageParams.hid,
    post_text:   remarked($form.find('textarea').val())
  };

  if (parentPostId) {
    data.parent_post_id = parentPostId;
  }

  N.io.rpc('forum.topic.reply', data).done(function (res) {
    removeEditor();
    // TODO: remove draft

    // TODO: append new posts
    window.location = res.redirect_url;
  });
});


N.wire.on('forum.post.reply.preview_toggle', function preview_toggle() {
  $preview.fadeToggle();
  // TODO: save preview visibility
});


// on Cancel button remove editor and store draft
//
N.wire.on('forum.post.reply.cancel', function cancel() {
  $form.fadeOut(function () {
    removeEditor();
  });
});


// terminate editor if user tries to edit post on the same page
//
N.wire.on('forum.post.edit', function click_edit() {
  removeEditor();
});
