// Forum Topic page logic
//

'use strict';


var _ = require('lodash');


var draft = require('../_draft');
// Editor class (CommonJS module), lazy-loaded
var Editor;

var topicInfo = {};

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
    if (eState.editor.isDirty() && 'post-reply' === eState.type) {
      saveDraft();
    }
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

    // Show hidden post
    if ('post-edit' === eState.type) {
      $('#post' + eState.post_id).show();
    }

    removeEditor();
  }

  N.loader.loadAssets('editor', function () {
    Editor = require("editor");

    eState.type = 'post-reply';
    eState.parent_post_id = parent_post_id;

    // draft id = 'forum:reply:<forum_id>:<topic_hid>:<post_id>'
    eState.draft_id = 'forum:reply:' + topicInfo.forum_id + ':' +
      topicInfo.hid + ':' + parent_post_id;

    // Create editing form instance
    eState.$form = $(N.runtime.render('forum.topic.reply'));
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
  // Save reply on server
  var post = {
    topic_hid: topicInfo.hid,
    format: 'txt',
    text: eState.editor.value()
  };

  if ('post-reply' === eState.type) {
    post.to_id = eState.parent_post_id;
  }

  if ('post-edit' === eState.type) {
    post._id = eState.post_id;
  }

  N.io.rpc('forum.topic.reply', post, function (err, env) {
    if (err) {
      return;
    }

    var locals = {
      topic: topicInfo,
      posts: env.data.posts,
      users: env.data.users
    };

    _.each(locals.posts, function(post){
      post.ts = new Date(post.ts);
    });

    // Render new post
    var $result = $(N.runtime.render('forum.blocks.posts_list', locals)).hide();

    if ('post-reply' === eState.type) {
      // Append new post
      $('#postlist > :last').after($result);
    }

    if ('post-edit' === eState.type) {
      // Replace post
      $('#post' + eState.post_id)
        .replaceWith($result)
        .fadeOut();
    }

    $result.fadeIn();

    removeEditor(true);
  });
});

// on Cancel reply button click
//
N.wire.on('forum.post.reply.cancel', function () {
  eState.$form.fadeOut(function () {
    // Show hidden post
    if ('post-edit' === eState.type) {
      $('#post' + eState.post_id).show();
    }

    removeEditor();
  });
});

N.wire.on('navigate.done:' + module.apiPath, function (/*config*/) {
  var $postlist = $('#postlist');

  topicInfo.hid = $postlist.data('topic_hid');
  topicInfo.forum_id = $postlist.data('forum_id');

});

// on page exit via link click
//
N.wire.on('navigate.exit:' + module.apiPath, function () {
  topicInfo = {};

  if (eState.$form && eState.editor.isDirty() && 'post-reply' === eState.type) {
    saveDraft();
  }
});


////////////////////////////////////////////////////////////////////////////////
// Edit post handlers logic


// Click on post edit link
//
N.wire.on('forum.post.edit', function (event) {
  var $button = $(event.currentTarget),
      button_offset = $button.offset().top,
      post_id = $button.data('post-id') || 0;

  // Check if previous editor exists
  if (eState.$form) {
    // If already editing this post, then nothing to do
    if (post_id === eState.post_id) {
      return;
    }

    // Show hidden post
    if ('post-edit' === eState.type) {
      $('#post' + eState.post_id).show();
    }

    removeEditor();
  }

  N.loader.loadAssets('editor', function () {
    Editor = require("editor");

    eState.type = 'post-edit';
    eState.post_id = post_id;

    // Create editing form instance
    eState.$form = $(N.runtime.render('forum.topic.reply', {
      type: eState.type
    }));
    eState.$form.hide();

    // Find target, to attach editor after
    var $target_post = $('#post' + eState.post_id);

    // Insert editing form after post
    $target_post.after(eState.$form);

    // Initialize editable area
    eState.editor = new Editor();
    eState.editor.attach(eState.$form.find('.forum-reply__editor'));

    // Load previously saved text
    eState.editor.value($target_post.find('.forum-post__message').html());

    // Show form
    eState.$form.fadeIn();

    // Fix scroll
    $('html,body').animate({scrollTop: '+=' + ($button.offset().top - button_offset)}, 0);

    // Hide post
    $target_post.hide();
  });
});


////////////////////////////////////////////////////////////////////////////////
// catch browser close

var winCloseHandler = function (/*event*/) {
  if (eState.$form && eState.editor.isDirty() && 'post-reply' === eState.type) {
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

N.wire.on('forum.topic.append_next_page', function (event) {
  var $button = $(event.currentTarget);
  var new_url = $button.attr('href');

  N.io.rpc(
    'forum.topic.list',
    { hid: $button.data('topic'), page: $button.data('page') },
    function (err, res) {

      // Process errors
      if (err) {
        // Do redirect, if happened
        if (err.code === N.io.REDIRECT) {
          N.wire.emit('navigate.to', err.head.Location);
          return;
        }
        // Notify user in other case
        return false;
      }

      var locals = res.data;

      // if no posts - just disable 'More' button
      if (!locals.posts || !locals.posts.length) {
        N.wire.emit('notify', {
          type: 'warning',
          message: t('error_no_more_posts')
        });
        $button.addClass('hidden');
        return;
      }

      locals.show_page_number = locals.page.current;

      // render & inject posts list
      var $result = $(N.runtime.render('forum.blocks.posts_list', locals));
      $('#postlist > :last').after($result);

      // update button data & state
      $button.data('page', locals.page.current + 1);

      $button.attr('href', N.runtime.router.linkTo('forum.topic', {
        hid:       locals.topic.hid
      , forum_id: locals.forum.id
      , page:     locals.page.current + 1
      }));

      if (locals.page.current === locals.page.max) {
        $button.addClass('hidden');
      }

      // update pager
      $('._pagination').html(
        N.runtime.render('common.blocks.pagination', {
          route:    'forum.topic'
        , params:   { hid: locals.topic.hid, forum_id: locals.forum.id }
        , current:  locals.page.current
        , max_page: locals.page.max
        })
      );

      // update history / url / title
      N.wire.emit('navigate.replace', {
        href: new_url,
        title: t('title_with_page', {
          title: locals.topic.title,
          page: locals.page.current
        })
      });
    }
  );

  return;
});
