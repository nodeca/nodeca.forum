// Forum Thread page logic
//

'use strict';


var draft = require('../_draft');
// Editor class (CommonJS module), lazy-loaded
var Editor;

// Editor state
var eState = {};

// helper to save reply/edit draft
function saveDraft() {
  // TODO: store draft, depending on it's type (reply/edit)
  if (eState.editor.value()) {
    draft.save(eState.draft_id, eState.editor.value());
  } else {
    // If content empty - cleanup draft key, don't store empty records
    draft.save(eState.draft_id);
  }
}

// helper to destroy editor & free resourses
// - dropDraft: true to delete draft, autosave in other case
function removeEditor(dropDraft) {
  if (dropDraft) {
    draft.remove(eState.draft_id);
  } else {
    saveDraft();
  }

  // cleanup
  eState.editor.remove();
  eState.$form.remove();
  eState = {};
}

////////////////////////////////////////////////////////////////////////////////
// Reply post handlers logic


// Click on post reply link or toolbar reply button
//
N.wire.on('forum.post.reply', function (event) {
  var $button = $(event.currentTarget),
      button_offset = $button.offset().top,
      parent_post_id = $button.data('post-id') || 0;

  // Check if previous editor exists
  if (eState.$form) {
    // If already writing reply to this post, then nothing to do
    if (parent_post_id === eState.parent_post_id) {
      return;
    }

    removeEditor();
  }

  N.loader.loadAssets('editor', function () {
    Editor = require("editor");

    eState.type = 'post-reply';
    eState.parent_post_id = parent_post_id;

    var $postlist = $('#postlist');

    // draft id = 'forum:reply:<forum_id>:<thread_id>:<post_id>'
    eState.draft_id = 'forum:reply:' + $postlist.data('forum_id') + ':' +
      $postlist.data('thread_id') + ':' + parent_post_id;

    // Create editing form instance
    eState.$form = $(N.runtime.render('forum.thread.reply'));
    eState.$form.hide();

    var $parent_post;

    // Find parent, to attach editor after. For new reply - last child
    if (eState.parent_post_id) {
      $parent_post = $('#post' + eState.parent_post_id);
    } else {
      $parent_post = $('#postlist > :last');
    }

    // Insert editing form after editor post
    $parent_post.after(eState.$form);

    // Initialize editable area
    eState.editor = new Editor();
    eState.editor.attach(eState.$form.find('.forum-reply__editor'));

    // Load draft if exists
    eState.editor.value(draft.find(eState.draft_id) || '');

    // Show form
    eState.$form.fadeIn();

    // Fix scroll
    $('html,body').animate({scrollTop: '+=' + ($button.offset().top - button_offset)}, 0);
  });
});

// on eState Save button click
//
N.wire.on('forum.post.reply.save', function () {
  // TODO: Save reply on server
  removeEditor(true);
});

// on Cancel reply button click
//
N.wire.on('forum.post.reply.cancel', function () {
  eState.$form.fadeOut(function () {
    removeEditor();
  });
});

// on page exit via link click
//
N.wire.on('navigate.exit:' + module.apiPath, function () {
  if (eState.$form && eState.editor.isDirty()) {
    saveDraft();
  }
});


////////////////////////////////////////////////////////////////////////////////
// catch browser close

var winCloseHandler = function (/*event*/) {
  if (eState.$form && eState.editor.isDirty()) {
    saveDraft();
  }
};

N.wire.on('navigate.done:' + module.apiPath, function () {
  $(window).on('beforeunload', winCloseHandler);
});

N.wire.before('navigate.exit:' + module.apiPath, function () {
  $(window).off('beforeunload', winCloseHandler);
});


////////////////////////////////////////////////////////////////////////////////
// "More posts" button logic

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
