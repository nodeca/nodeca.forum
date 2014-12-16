// Forum Topic page logic
//

'use strict';

// Topic state
//
// - topic_hid:             topic's human id
// - section_hid:     id of the current section
// - page:            topic's next page
//
var topicState = {};

// init on page load and destroy editor on window unload
//
N.wire.on('navigate.done:' + module.apiPath, function page_setup(data) {
  topicState.topic_hid = +data.params.hid;
  topicState.section_hid = +data.params.section_hid;
  topicState.page = +data.params.page;
});


N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  // Pin/unpin topic button handler
  //
  N.wire.on('forum.topic.pin', function topic_pin(event) {
    var $button = $(event.target);
    var topicHid = $button.data('topic-hid');

    N.io.rpc('forum.topic.pin', { topic_hid: topicHid }).done(function (res) {
      $button.text(res.pinned ? t('unpin') : t('pin'));
    });
  });


  // Edit title button handler
  //
  N.wire.on('forum.topic.edit_title', function title_edit(event) {
    var $button = $(event.target);
    var $title = $('.forum-topic-title__text');

    var data = {
      topic_id: $button.data('topic-id'),
      mod_action: $button.data('moderator-action') || false,
      title: $title.text(),
      new_title: null
    };

    N.wire.emit('forum.topic.title_edit_dlg', data, function () {
      $title.text(data.new_title);
    });
  });


  // Delete topic button handler
  //
  N.wire.on('forum.topic.topic_delete', function topic_delete(event) {
    var topicHid = $(event.target).data('topic-hid');
    var moderatorAction = $(event.target).data('moderator-action') || false;

    N.io.rpc('forum.topic.destroy', { topic_hid: topicHid, moderator_action: moderatorAction }).done(function () {
      N.wire.emit('navigate.to', { apiPath: 'forum.section', params: { hid: topicState.section_hid, page: 1 } });
    });
  });


  // Delete post button handler
  //
  N.wire.on('forum.topic.post_delete', function post_delete(event) {
    var postId = $(event.target).data('post-id');
    var moderatorAction = $(event.target).data('moderator-action') || false;
    var $post = $('#post' + postId);

    N.io.rpc('forum.topic.post.destroy', { post_id: postId, moderator_action: moderatorAction }).done(function () {
      $post.fadeOut(function () {
        $post.remove();
      });
    });
  });


  // "More posts" button logic
  //
  N.wire.on('forum.topic.append_next_page', function append_next_page(event) {
    var $button = $(event.currentTarget);

    // request for the next page
    N.io.rpc( 'forum.topic.list', { hid: topicState.topic_hid, page: topicState.page + 1 }).done(function (res) {
      // if no posts - just disable 'More' button
      if (!res.posts || !res.posts.length) {
        N.wire.emit('notify', {
          type: 'warning',
          message: t('error_no_more_posts')
        });
        $button.addClass('hidden');
        return;
      }

      res.show_page_number = res.page.current;

      // render & inject posts list
      var $result = $(N.runtime.render('forum.blocks.posts_list', res));
      $('#postlist > :last').after($result);

      // store current url to replace it in browser
      var currentUrl = $button.attr('href');

      // update button href with next page URL
      $button.attr('href', N.router.linkTo('forum.topic', {
        hid:          res.topic.hid,
        section_hid:  res.section.hid,
        page:         res.page.current + 1
      }));

      // hide button if max page is reached
      if (res.page.current === res.page.max) {
        $button.addClass('hidden');
      }

      // update pager
      $('._pagination').html(
        N.runtime.render('common.blocks.pagination', {
          route:    'forum.topic'
        , params:   { hid: res.topic.hid, section_hid: res.section.hid }
        , current:  res.page.current
        , max: res.page.max
        })
      );

      // update history / url / title
      N.wire.emit('navigate.replace', {
        href: currentUrl,
        title: t('title_with_page', {
          title: res.topic.title,
          page: res.page.current
        })
      });

      // update topic state
      topicState.page = res.page.current;
    });
  });
});
