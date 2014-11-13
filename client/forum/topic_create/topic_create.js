// Add topic page logic
//

'use strict';

var _ = require('lodash');
var medialinks = require('nodeca.core/lib/parser/medialinks');
var bag = new window.Bag();

var editor, parseRules, postOptions, sectionHid;
var draftKey = 'topic_create';


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


// Init on page load
//
N.wire.on('navigate.done:' + module.apiPath, function page_setup(data) {
  var $title = $('.topic-create__title');

  sectionHid = data.params.section_hid;

  bag.get(draftKey, function (__, data) {
    $title.val(data ? data.title : '');

    editor = new N.MDEdit({
      editArea: '.topic-create__editor',
      previewArea: '.topic-create__preview',
      parseRules: parseRules,
      toolbarButtons: '$$ JSON.stringify(N.config.mdedit.toolbar) $$',
      markdown: data ? data.md : ''
    });

    editor.ace.getSession().on('change', _.debounce(function () {
      bag.set(draftKey, {
        md: editor.ace.getValue(),
        title: $title.val()
      });
    }, 500));

    $('.topic-create__medialinks').prop('checked', !postOptions.no_mlinks);
    $('.topic-create__smiles').prop('checked', !postOptions.no_smiles);
    updatePostOptions();
  });
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
    $('.topic-create__options').slideToggle();
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
    $('.topic-create__preview').slideToggle();
  });


  // Create button click handler
  //
  N.wire.on('forum.topic_create:save', function create_topic() {
    var data = {
      section_hid:      sectionHid,
      post_md:          editor.markdown,
      topic_title:      $('.topic-create__title').val(),
      attach_tail:      _.map(editor.attachments, function (v) { return v.media_id; }),
      option_no_mlinks: postOptions.no_mlinks,
      option_no_smiles: postOptions.no_smiles
    };


    if (data.topic_title === '' || data.post_md === '') {
      N.wire.emit('notify', t('err_required_fields_empty'));
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
