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


var _    = require('lodash');


var options;
var post;


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


// Fetch post and options
//
N.wire.before(module.apiPath + ':begin', function fetch_options(data, callback) {
  N.io.rpc('forum.topic.post.edit.index', { post_id: data.post_id, as_moderator: data.as_moderator })
      .done(function (response) {

    N.io.rpc('forum.topic.post.options').done(function (opt) {
      options = {
        parse_options: opt.parse_options,
        user_settings: {
          no_mlinks: !response.params.medialinks,
          no_emojis: !response.params.emojis
        }
      };

      post = {
        md: response.md,
        attachments: response.attachments
      };

      callback();
    });
  });
});


// Show editor and add handlers for editor events
//
N.wire.on(module.apiPath + ':begin', function show_editor(data) {
  var $editor = N.MDEdit.show({
    text: post.md,
    attachments: post.attachments
  });

  updateOptions();

  $editor
    .on('show.nd.mdedit', function () {
      var title = t('edit_post', {
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
    .on('submit.nd.mdedit', function () {
      var params = {
        as_moderator:     data.as_moderator,
        post_id:          data.post_id,
        txt:              N.MDEdit.text(),
        attach:           N.MDEdit.attachments(),
        option_no_mlinks: options.user_settings.no_mlinks,
        option_no_emojis: options.user_settings.no_emojis
      };

      N.io.rpc('forum.topic.post.edit.update', params).done(function (response) {
        var $post = $('#post' + data.post_id);

        N.MDEdit.hide();

        $post.find('.forum-post__message').html(response.post.html);
        $post.find('.forum-post__tail').html(
          N.runtime.render('forum.blocks.posts_list.attachments', {
            post: response.post,
            user: { hid: $post.data('user-hid') }
          })
        );
        $post.removeClass('forum-post__m-flash');
        setTimeout(function () {
          $post.addClass('forum-post__m-flash');
        }, 0);
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
