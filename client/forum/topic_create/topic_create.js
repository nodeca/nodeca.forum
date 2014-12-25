// Add topic page logic
//

'use strict';

var _          = require('lodash');
var punycode   = require('punycode');

var medialinks = require('nodeca.core/lib/parser/medialinks');
var Bag        = require('bag.js');

var bag = new Bag({ prefix: 'nodeca_drafts' });
var draftKey;
var editor, parseRules, postOptions, sectionHid;


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


// Load editor
//
N.wire.before('navigate.done:' + module.apiPath, function load_editor(event, callback) {
  N.loader.loadAssets('mdedit', callback);
});


// Fetch post options
//
N.wire.before('navigate.done:' + module.apiPath, function fetch_options(event, callback) {
  N.io.rpc('forum.topic.post.options').done(function (res) {
    parseRules = res.parse_rules;
    parseRules.medialinkProviders = medialinks(parseRules.medialinks.providers, parseRules.medialinks.content, true);
    postOptions = res.post_options;
    callback();
  });
});


var draft;

// Fetch draft data
//
N.wire.before('navigate.done:' + module.apiPath, function fetch_draft(__, callback) {
  draftKey = 'topic_create_' + N.runtime.user_hid;

  draft = {
    title: '',
    text: '',
    attachments: []
  };

  bag.get(draftKey, function (__, data) {

    if (!data) {
      callback();
      return;
    }

    draft.title = data.title || '';
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


// Init on page load
//
N.wire.on('navigate.done:' + module.apiPath, function page_setup(data) {
  var $title = $('.topic-create__title');

  sectionHid = data.params.section_hid;

  $title.val(draft.title);

  editor = new N.MDEdit({
    editArea: '.topic-create__editor',
    previewArea: '.topic-create__preview',
    parseRules: parseRules,
    toolbarButtons: '$$ JSON.stringify(N.config.mdedit.toolbar) $$',
    text: draft.text,
    attachments: draft.attachments,
    onChange: _.debounce(function () {
      bag.set(draftKey, {
        text: editor.text(),
        title: $title.val(),
        attachments: editor.attachments()
      });
    }, 500)
  });

  draft = null;

  $('.topic-create__medialinks').prop('checked', !postOptions.no_mlinks);
  $('.topic-create__smiles').prop('checked', !postOptions.no_smiles);
  updatePostOptions();
});


// Free resources on page leave
//
N.wire.on('navigate.exit:' + module.apiPath, function page_exit() {
  editor = null;
  parseRules = null;
  postOptions = null;
});


N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  // Show/hide post options
  //
  N.wire.on('forum.topic_create:options', function toggle_options() {
    $('.topic-create__options').slideToggle('fast');
  });


  // Change convert medialinks option
  //
  N.wire.on('forum.topic_create:opt_medialinks', function opt_medialinks(event) {
    postOptions.no_mlinks = !$(event.target).prop('checked');
    updatePostOptions();
  });


  // Change convert smiles option
  //
  N.wire.on('forum.topic_create:opt_smiles', function opt_smiles(event) {
    postOptions.no_smiles = !$(event.target).prop('checked');
    updatePostOptions();
  });


  // Show/hide preview
  //
  N.wire.on('forum.topic_create:preview_toggle', function toggle_preview() {
    $('.topic-create__preview').slideToggle('fast');
  });


  // Create button click handler
  //
  N.wire.on('forum.topic_create:save', function create_topic() {
    var data = {
      section_hid:      sectionHid,
      post_md:          editor.text(),
      topic_title:      $('.topic-create__title').val(),
      attach_tail:      _.map(editor.attachments(), function (v) { return v.media_id; }),
      option_no_mlinks: postOptions.no_mlinks,
      option_no_smiles: postOptions.no_smiles
    };

    if (punycode.ucs2.decode(data.topic_title.trim()).length < N.runtime.page_data.settings.topic_title_min_length) {
      N.wire.emit('notify', t('err_title_length', { min_length: N.runtime.page_data.settings.topic_title_min_length }));
      return;
    }

    if (data.post_md === '') {
      N.wire.emit('notify', t('err_text_empty'));
      return;
    }

    N.io.rpc('forum.topic.create', data).done(function (res) {
      bag.remove(draftKey, function () {
        N.wire.emit('navigate.to', {
          apiPath: 'forum.topic',
          params: {
            section_hid: sectionHid,
            hid: res.topic_hid
          }
        });
      });
    });
  });
});
