// Edit post
//
// data:
//
// - topic_hid
// - topic_title
// - section_hid
// - post_id
// - post_hid
// - as_moderator
//
'use strict';


const _ = require('lodash');


let options;
let post;


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


// Fetch post and options
//
N.wire.before(module.apiPath + ':begin', function fetch_options(data) {
  let postData;

  return Promise.resolve()
    .then(() => N.io.rpc('forum.topic.post.edit.index', { post_id: data.post_id, as_moderator: data.as_moderator }))
    .then(response => {
      postData = response;

      return N.io.rpc('forum.topic.post.options');
    })
    .then(opt => {
      options = {
        parse_options: opt.parse_options,
        user_settings: {
          no_mlinks:         !postData.params.link_to_title && !postData.params.link_to_snippet,
          no_emojis:         !postData.params.emoji,
          no_quote_collapse: !postData.params.quote_collapse
        }
      };

      post = {
        user_id:     postData.user_id,
        md:          postData.md,
        attachments: postData.attachments
      };
    });
});


// Show editor and add handlers for editor events
//
N.wire.on(module.apiPath + ':begin', function show_editor(data) {
  let $editor = N.MDEdit.show({
    text: post.md,
    // hide attachment button when moderators edit posts created by others
    // (note: editing their own posts as moderators will still show normal toolbar)
    toolbar: post.user_id !== N.runtime.user_id ? 'as_moderator' : 'default',
    attachments: post.attachments
  });

  updateOptions();

  $editor
    .on('show.nd.mdedit', () => {
      let title = t('edit_post', {
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
        as_moderator:             data.as_moderator,
        post_id:                  data.post_id,
        txt:                      N.MDEdit.text(),
        attach:                   _.map(N.MDEdit.attachments(), 'media_id'),
        option_no_mlinks:         options.user_settings.no_mlinks,
        option_no_emojis:         options.user_settings.no_emojis,
        option_no_quote_collapse: options.user_settings.no_quote_collapse
      };

      N.io.rpc('forum.topic.post.edit.update', params).then(res => {
        let $post = $('#post' + data.post_id);
        let $result = $(N.runtime.render('forum.blocks.posts_list', res));

        N.MDEdit.hide();

        N.wire.emit('navigate.update', { $: $result, locals: res }, () => {
          $post.replaceWith($result);
          setTimeout(() => $result.addClass('forum-post__m-flash'), 0);
        });
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
  N.wire.emit('common.blocks.editor_options_dlg', options.user_settings, function () {
    updateOptions();
  });
});
