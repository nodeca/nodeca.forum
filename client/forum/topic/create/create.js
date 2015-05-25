// Create new topic
//
// data:
//
// - section_hid
// - section_title
//
'use strict';


var _    = require('lodash');
var Bag  = require('bag.js');
var bag  = new Bag({ prefix: 'nodeca_drafts' });


var draftKey;
var options;
var draft;



function updateOptions() {
  N.MDEdit.parseOptions(_.assign({}, options.parse_options, {
    medialinks: options.user_settings.no_mlinks ? false : options.parse_options.medialinks,
    emojis: options.user_settings.no_emojis ? false : options.parse_options.emojis
  }));
}


// Load mdedit
//
N.wire.before(module.apiPath + ':begin', function load_mdedit(__, callback) {
  N.loader.loadAssets('mdedit', callback);
});


// Fetch options
//
N.wire.before(module.apiPath + ':begin', function fetch_options(__, callback) {
  N.io.rpc('forum.topic.post.options').done(function (opt) {
    options = opt;
    callback();
  });
});


// Fetch draft data
//
N.wire.before(module.apiPath + ':begin', function fetch_draft(data, callback) {
  draftKey = [ 'topic_create', N.runtime.user_hid, data.section_hid ].join('_');

  bag.get(draftKey, function (__, data) {
    draft = data || {};

    if (!draft.attachments || draft.attachments.length === 0) {
      callback();
      return;
    }

    var params = {
      media_ids: _.pluck(draft.attachments, 'media_id')
    };

    N.io.rpc('forum.topic.attachments_check', params).done(function (res) {
      draft.attachments = draft.attachments.filter(function (attach) {
        return res.media_ids.indexOf(attach.media_id) !== -1;
      });

      callback();
    });
  });
});


// Show editor and add handlers for editor events
//
N.wire.on(module.apiPath + ':begin', function show_editor(data) {
  var $editor = N.MDEdit.show({
    text: draft.text,
    attachments: draft.attachments
  });

  updateOptions();

  $editor
    .on('show.nd.mdedit', function () {
      var title = t('create_topic', {
        section_url: N.router.linkTo('forum.section', { hid: data.section_hid }),
        section_title: _.escape(data.section_title)
      });

      $editor.find('.mdedit-header__caption').html(title);
      $editor.find('.mdedit-header')
        .append(N.runtime.render(module.apiPath + '.title_input', draft));

      $editor.find('.mdedit-footer').append(N.runtime.render(module.apiPath + '.options_btn'));
    })
    .on('change.nd.mdedit', function () {
      bag.set(draftKey, {
        title: $('.topic-create__title').val(),
        text: N.MDEdit.text(),
        attachments: N.MDEdit.attachments()
      });
    })
    .on('submit.nd.mdedit', function () {
      var params = {
        section_hid:      data.section_hid,
        title:            $('.topic-create__title').val(),
        txt:              N.MDEdit.text(),
        attach:           N.MDEdit.attachments(),
        option_no_mlinks: options.user_settings.no_mlinks,
        option_no_emojis: options.user_settings.no_emojis
      };

      N.io.rpc('forum.topic.create', params).done(function (response) {
        bag.remove(draftKey, function () {
          N.MDEdit.hide();
          N.wire.emit('navigate.to', {
            apiPath: 'forum.topic',
            params: {
              section_hid: data.section_hid,
              topic_hid:   response.topic_hid,
              post_hid:    response.post_hid
            }
          });
        });
      });

      return false;
    });
});


// Open options dialog
//
N.wire.on(module.apiPath + ':options', function show_options_dlg() {
  N.wire.emit('common.blocks.editor_options_dlg', options.user_settings, function () {
    updateOptions();
  });
});
