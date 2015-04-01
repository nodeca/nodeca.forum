// Add topic page logic
//

'use strict';

var _        = require('lodash');
var punycode = require('punycode');

var Bag      = require('bag.js');

var bag = new Bag({ prefix: 'nodeca_drafts' });
var draftKey;
var editor, parseOptions, postOptions, sectionHid;


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


// Load editor
//
N.wire.before('navigate.done:' + module.apiPath, function load_editor(data, callback) {
  N.loader.loadAssets('mdedit', callback);
});


// Fetch post options
//
N.wire.before('navigate.done:' + module.apiPath, function fetch_options(data, callback) {
  N.io.rpc('forum.topic.post.options').done(function (res) {
    parseOptions = res.parse_options;
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
    parseOptions: {},
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
  parseOptions = null;
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
  N.wire.on('forum.topic_create:opt_medialinks', function opt_medialinks(data) {
    postOptions.no_mlinks = !data.$this.prop('checked');
    updatePostOptions();
  });


  // Change convert smiles option
  //
  N.wire.on('forum.topic_create:opt_smiles', function opt_smiles(data) {
    postOptions.no_smiles = !data.$this.prop('checked');
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
      txt:              editor.text(),
      title:            $('.topic-create__title').val(),
      attach:           editor.attachments(),
      option_no_mlinks: postOptions.no_mlinks,
      option_no_smiles: postOptions.no_smiles
    };

    if (punycode.ucs2.decode(data.title.trim()).length < N.runtime.page_data.settings.topic_title_min_length) {
      N.wire.emit('notify', t('err_title_too_short', N.runtime.page_data.settings.topic_title_min_length));
      return;
    }

    if (data.txt === '') {
      N.wire.emit('notify', t('err_text_empty'));
      return;
    }

    N.io.rpc('forum.topic.create', data).done(function (res) {
      bag.remove(draftKey, function () {
        N.wire.emit('navigate.to', {
          apiPath: 'forum.topic',
          params: {
            section_hid: sectionHid,
            topic_hid:   res.topic_hid
          }
        });
      });
    });
  });
});
