// Create new topic
//
// data:
//
// - section_hid
// - section_title
//
'use strict';


const _   = require('lodash');
const bag = require('bagjs')({ prefix: 'nodeca' });


let draftKey;
let options;
let draft;


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
N.wire.before(module.apiPath + ':begin', function load_mdedit(__, callback) {
  N.loader.loadAssets('mdedit', callback);
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


// Fetch draft data
//
N.wire.before(module.apiPath + ':begin', function fetch_draft(data) {
  draftKey = [ 'topic_create', N.runtime.user_hid, data.section_hid ].join('_');
  draft = {};

  return bag.get(draftKey)
    .then(data => { draft = data || {}; })
    .catch(() => {}); // SUppress storage errors
});


// Check draft attachments
//
N.wire.before(module.apiPath + ':begin', function check_draft_attachments() {
  if (!draft.attachments || draft.attachments.length === 0) {
    return;
  }

  let params = {
    media_ids: _.map(draft.attachments, 'media_id')
  };

  return N.io.rpc('forum.topic.attachments_check', params).then(res => {
    draft.attachments = draft.attachments.filter(attach => res.media_ids.indexOf(attach.media_id) !== -1);
  });
});


// Show editor and add handlers for editor events
//
N.wire.on(module.apiPath + ':begin', function show_editor(data) {
  let $editor = N.MDEdit.show({
    text: draft.text,
    attachments: draft.attachments
  });

  updateOptions();

  $editor
    .on('show.nd.mdedit', () => {
      let title = t('create_topic', {
        section_url: N.router.linkTo('forum.section', { section_hid: data.section_hid }),
        section_title: _.escape(data.section_title)
      });

      $editor.find('.mdedit-header__caption').html(title);
      $editor.find('.mdedit-header')
        .append(N.runtime.render(module.apiPath + '.title_input', draft));

      $editor.find('.mdedit-footer').append(N.runtime.render(module.apiPath + '.options_btn'));
    })
    .on('change.nd.mdedit', () => {
      // Expire after 7 days
      bag.set(draftKey, {
        title: $('.topic-create__title').val(),
        text: N.MDEdit.text(),
        attachments: N.MDEdit.attachments()
      }, 7 * 24 * 60 * 60);
    })
    .on('submit.nd.mdedit', () => {
      let params = {
        section_hid:              data.section_hid,
        title:                    $('.topic-create__title').val(),
        txt:                      N.MDEdit.text(),
        attach:                   _.map(N.MDEdit.attachments(), 'media_id'),
        option_no_mlinks:         options.user_settings.no_mlinks,
        option_no_emojis:         options.user_settings.no_emojis,
        option_no_quote_collapse: options.user_settings.no_quote_collapse
      };

      N.io.rpc('forum.topic.create', params).then(response => {
        bag.remove(draftKey)
          .catch(() => {}) // Suppress storage erors
          .then(() => {
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
      }).catch(err => N.wire.emit('error', err));

      return false;
    });
});


// Open options dialog
//
N.wire.on(module.apiPath + ':options', function show_options_dlg() {
  return N.wire.emit('common.blocks.editor_options_dlg', options.user_settings).then(updateOptions);
});
