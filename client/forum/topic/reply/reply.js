// Reply to post
//
// data:
//
// - topic_hid
// - topic_title
// - section_hid
// - post_id - optional, parrent post id
// - post_hid - optional, parrent post hid
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
    link_to_title: options.user_settings.no_mlinks ? false : options.parse_options.link_to_title,
    link_to_snippet: options.user_settings.no_mlinks ? false : options.parse_options.link_to_snippet,
    emoji: options.user_settings.no_emojis ? false : options.parse_options.emoji
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
    options = {
      parse_options: opt.parse_options,
      user_settings: {
        no_mlinks: false,
        no_emojis: false
      }
    };

    callback();
  });
});


// Fetch draft data
//
N.wire.before(module.apiPath + ':begin', function fetch_draft(data, callback) {
  draftKey = [ 'post_reply', N.runtime.user_hid, data.topic_hid, data.post_hid || '' ].join('_');

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
      var title = t(data.post_hid ? 'reply_post' : 'reply_topic', {
        topic_url: N.router.linkTo('forum.topic', {
          section_hid: data.section_hid,
          topic_hid: data.topic_hid
        }),
        topic_title: _.escape(data.topic_title),
        post_url: N.router.linkTo('forum.topic', {
          section_hid: data.section_hid,
          topic_hid: data.topic_hid,
          post_hid: data.post_hid
        }),
        post_hid: data.post_hid
      });

      $editor.find('.mdedit-header__caption').html(title);
      $editor.find('.mdedit-footer').append(N.runtime.render(module.apiPath + '.options_btn'));
    })
    .on('change.nd.mdedit', function () {
      bag.set(draftKey, {
        text: N.MDEdit.text(),
        attachments: N.MDEdit.attachments()
      });
    })
    .on('submit.nd.mdedit', function () {
      var params = {
        section_hid:      data.section_hid,
        topic_hid:        data.topic_hid,
        txt:              N.MDEdit.text(),
        attach:           _.pluck(N.MDEdit.attachments(), 'media_id'),
        option_no_mlinks: options.user_settings.no_mlinks,
        option_no_emojis: options.user_settings.no_emojis
      };

      if (data.post_id) {
        params.parent_post_id = data.post_id;
      }

      N.io.rpc('forum.topic.post.reply', params).done(function (response) {
        bag.remove(draftKey, function () {
          N.MDEdit.hide();
          N.wire.emit('navigate.to', response.redirect_url);
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
