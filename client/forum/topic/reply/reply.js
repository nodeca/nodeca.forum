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


const _ = require('lodash');


let options;


function updateOptions() {
  N.MDEdit.parseOptions(_.assign({}, options.parse_options, {
    link_to_title:   options.user_settings.no_mlinks         ? false : options.parse_options.link_to_title,
    link_to_snippet: options.user_settings.no_mlinks         ? false : options.parse_options.link_to_snippet,
    quote_collapse:  options.user_settings.no_quote_collapse ? false : options.parse_options.quote_collapse,
    emoji:           options.user_settings.no_emojis         ? false : options.parse_options.emoji
  }));
}


// Load mdedit
//
N.wire.before(module.apiPath + ':begin', function load_mdedit() {
  return N.loader.loadAssets('mdedit');
});


// Fetch options
//
N.wire.before(module.apiPath + ':begin', function fetch_options() {
  return N.io.rpc('forum.topic.post.options').then(opt => {
    options = {
      parse_options: opt.parse_options,
      user_settings: {
        no_mlinks:         false,
        no_emojis:         false,
        no_quote_collapse: false
      }
    };
  });
});


// Show editor and add handlers for editor events
//
N.wire.on(module.apiPath + ':begin', function show_editor(data) {
  let $editor = N.MDEdit.show({
    draftKey: [ 'post_reply', N.runtime.user_hid, data.topic_hid, data.post_hid || '' ].join('_')
  });

  updateOptions();

  $editor
    .on('show.nd.mdedit', () => {
      let title = t(data.post_hid ? 'reply_post' : 'reply_topic', {
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
    .on('submit.nd.mdedit', () => {
      $editor.find('.mdedit-btn__submit').addClass('disabled');

      let params = {
        topic_hid:                data.topic_hid,
        txt:                      N.MDEdit.text(),
        option_no_mlinks:         options.user_settings.no_mlinks,
        option_no_emojis:         options.user_settings.no_emojis,
        option_no_quote_collapse: options.user_settings.no_quote_collapse
      };

      if (data.post_id) {
        params.parent_post_id = data.post_id;
      }

      N.io.rpc('forum.topic.post.reply', params).then(response => {
        N.MDEdit.hide({ removeDraft: true });
        N.wire.emit('navigate.to', response.redirect_url);
      }).catch(err => {
        $editor.find('.mdedit-btn__submit').removeClass('disabled');
        N.wire.emit('error', err);
      });

      return false;
    });
});


// Open options dialog
//
N.wire.on(module.apiPath + ':options', function show_options_dlg() {
  return N.wire.emit('common.blocks.editor_options_dlg', options.user_settings).then(updateOptions);
});
