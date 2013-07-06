'use strict';

var DraftStorage = require('../_draft');

var draft = new DraftStorage();

// Editor class
var Editor;

var editor = {};

function initEditor ($parent_post) {
  // Create editing form instance
  editor.$form = $(N.runtime.render('forum.thread.reply'));
  editor.$form.hide();

  // Insert editing form after editor post
  $parent_post.after(editor.$form);

  editor.field = new Editor();

  // Insert editor after editor post
  editor.field.attach(editor.$form.find('.forum-reply__editor'));

  // Animate form
  editor.$form.fadeIn();
}

function dropEditor () {
  editor.field.remove();
  editor.field = null;

  editor.$form.remove();
  editor.$form = null;
}

N.wire.on('forum.post.reply', function (event) {
  var $button = $(event.currentTarget),
      parent_post_id = $button.data('post-id'),
      $parent_post = $('#post' + parent_post_id);

  // Check if previous editor exists
  if (editor.$form) {
    // If already writing reply to this post, then nothing to do
    if (parent_post_id === editor.parent_post_id) {
      return;
    }

    // Save draft and remove editor
    draft.save(editor.parent_post_id, 'forum.post', editor.field.value());
    dropEditor();
  }

  N.loader.loadAssets('editor', function () {
    Editor = require("editor");

    // Init editor and load draft
    initEditor($parent_post);
    editor.parent_post_id = parent_post_id;
    editor.field.value(draft.find(editor.parent_post_id, 'forum.post') || '');
  });
});

N.wire.on('forum.reply.save', function () {
  // TODO: Save reply on server
  draft.remove(editor.parent_post_id, 'forum.post');
  dropEditor();
});

N.wire.on('forum.reply.cancel', function () {
  draft.save(editor.parent_post_id, 'forum.post', editor.field.value());
  dropEditor();
});

N.wire.on('navigate.exit:' + module.apiPath, function () {
  if (editor.$form) {
    if (window.confirm(t('warn_unsaved'))) {
      draft.save(editor.parent_post_id, 'forum.post', editor.field.value());
      dropEditor();
    } else {
      return false;
    }
  }
});

N.wire.once('navigate.done', function () {
  $(window).on('beforeunload', function (event) {
    if (!editor.$form) {
      return; // No opened form on page - do nothing.
    }

    event = event || window.event;

    var message = t('warn_unsaved');

    // For IE and Firefox
    if (event) {
      event.returnValue = message;
    }

    // For Chrome and Safari
    return message;
  });
});

N.wire.on('forum.thread.append_next_page', function (event) {
  var $button = $(event.currentTarget);

  function renderNextPage(data, callback) {
    var $result, locals = data.locals;

    locals.show_page_number = locals.page.current;

    // Hide "More posts" button if there are no more pages.
    // Or update the button's link to the next page.
    if (locals.page.current === locals.page.max) {
      $button.addClass('hidden');
    } else {
      $button.attr('href', N.runtime.router.linkTo('forum.thread', {
        id:       locals.thread.id
      , forum_id: locals.thread.forum_id
      , page:     locals.page.current + 1
      }));
    }

    $result = $(N.runtime.render('forum.blocks.posts_list', locals)).hide();
    $('#postlist > :last').after($result);

    // update pager
    $('.pagination').replaceWith(
      N.runtime.render('common.blocks.pagination', {
        route:    'forum.thread'
      , params:   locals.thread
      , current:  locals.page.current
      , max_page: locals.page.max
      })
    );

    // show content
    $result.fadeIn();
    callback();
  }

  N.wire.emit('navigate.to', {
    href: $button.attr('href')
  , render: renderNextPage
  , replaceState: true
  });
});
