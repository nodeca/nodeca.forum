// Forum Topic page logic
//

'use strict';

var _        = require('lodash');
var punycode = require('punycode');

var topicStatuses = '$$ JSON.stringify(N.models.forum.Topic.statuses) $$';

// Topic state
//
// - topic_hid:       topic's human id
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

  // Show post IP
  //
  N.wire.on('forum.topic.post_show_ip', function post_show_ip(event) {
    var postId = $(event.target).data('post-id');

    N.wire.emit('forum.topic.ip_info_dlg', { postId: postId });
  });


  // Update topic menu and modifiers for new topic state
  //
  // topic:
  // - st
  // - ste
  //
  var updateTopic = function (topic, callback) {
    var params = {};

    N.wire.emit('navigate.get_page_raw', params, function () {
      // - reset previous `st` and `ste`
      // - set new `st` and `ste`
      var pageData = _.merge({}, params.data, { topic: { st: null, ste: null } }, { topic: topic });

      $('.forum-topic__dropdown').replaceWith(
        N.runtime.render('forum.topic.topic_dropdown_menu', pageData)
      );

      if (pageData.topic.st === topicStatuses.OPEN || pageData.topic.ste === topicStatuses.OPEN) {
        $('.forum-topic-root').addClass('forum-topic-root__m-open');
      } else {
        $('.forum-topic-root').removeClass('forum-topic-root__m-open');
      }

      if (pageData.topic.st === topicStatuses.CLOSED || pageData.topic.ste === topicStatuses.CLOSED) {
        $('.forum-topic-root').addClass('forum-topic-root__m-closed');
      } else {
        $('.forum-topic-root').removeClass('forum-topic-root__m-closed');
      }

      if (pageData.topic.st === topicStatuses.DELETED) {
        $('.forum-topic-root').addClass('forum-topic-root__m-deleted');
      } else {
        $('.forum-topic-root').removeClass('forum-topic-root__m-deleted');
      }

      if (pageData.topic.st === topicStatuses.DELETED_HARD) {
        $('.forum-topic-root').addClass('forum-topic-root__m-deleted-hard');
      } else {
        $('.forum-topic-root').removeClass('forum-topic-root__m-deleted-hard');
      }

      if (pageData.topic.st === topicStatuses.PINNED) {
        $('.forum-topic-root').addClass('forum-topic-root__m-pinned');
      } else {
        $('.forum-topic-root').removeClass('forum-topic-root__m-pinned');
      }

      callback();
    });
  };


  // Expand deleted or hellbanned post
  //
  N.wire.on('forum.topic.post_expand', function post_expand(event) {
    var postId = $(event.currentTarget).data('post-id');

    N.io.rpc('forum.topic.list.by_ids', { topic_hid: topicState.topic_hid, posts_ids: [ postId ] })
        .done(function (res) {

      $('#post' + postId).replaceWith(N.runtime.render('forum.blocks.posts_list', _.assign(res, { expand: true })));
    });
  });


  // Pin/unpin topic
  //
  N.wire.on('forum.topic.pin', function topic_pin(event) {
    var $button = $(event.target);
    var topicId = $button.data('topic-id');
    var unpin = $button.data('unpin') || false;

    N.io.rpc('forum.topic.pin', { topic_id: topicId, unpin: unpin }).done(function (res) {
      updateTopic(res.topic, function () {
        if (unpin) {
          N.wire.emit('notify', { type: 'info', message: t('unpin_topic_done') });
        } else {
          N.wire.emit('notify', { type: 'info', message: t('pin_topic_done') });
        }
      });
    });
  });


  // Close/open topic handler
  //
  N.wire.on('forum.topic.close', function topic_close(event) {
    var $button = $(event.target);

    var data = {
      topic_id: $button.data('topic-id'),
      reopen: $button.data('reopen') || false,
      as_moderator: $button.data('as-moderator') || false
    };

    N.io.rpc('forum.topic.close', data).done(function (res) {
      updateTopic(res.topic, function () {
        if (data.reopen) {
          N.wire.emit('notify', { type: 'info', message: t('open_topic_done') });
        } else {
          N.wire.emit('notify', { type: 'info', message: t('close_topic_done') });
        }
      });
    });
  });


  // Edit title handler
  //
  N.wire.on('forum.topic.edit_title', function title_edit(event) {
    var $button = $(event.target);
    var $title = $('.forum-topic-title__text');

    var data = {
      selector: '.forum-topic-title',
      value: $title.text(),
      update: function (value, callback) {

        if (punycode.ucs2.decode(value.trim()).length < N.runtime.page_data.settings.topic_title_min_length) {
          callback(t('err_title_too_short', N.runtime.page_data.settings.topic_title_min_length));
          return;
        }

        // If value is equals to old value - close `microedit` without request
        if (value === $title.text()) {
          callback();
          return;
        }

        N.io.rpc('forum.topic.title_update', {
          as_moderator: $button.data('as-moderator') || false,
          topic_id: $button.data('topic-id'),
          title: value
        }).done(function () {
          $title.text(value.trim());
          callback();
        });
      }
    };

    N.wire.emit('common.blocks.microedit', data);
  });


  // Undelete topic handler
  //
  N.wire.on('forum.topic.topic_undelete', function topic_undelete(event) {
    var topicId = $(event.target).data('topic-id');

    N.io.rpc('forum.topic.undelete', { topic_id: topicId }).done(function (res) {
      updateTopic(res.topic, function () {
        N.wire.emit('notify', { type: 'info', message: t('undelete_topic_done') });
      });
    });
  });


  // Undelete post handler
  //
  N.wire.on('forum.topic.post_undelete', function post_undelete(event) {
    var postId = $(event.target).data('post-id');

    N.io.rpc('forum.topic.post.undelete', { post_id: postId }).done(function () {
      $('#post' + postId)
        .removeClass('forum-post__m-deleted')
        .removeClass('forum-post__m-deleted-hard');
    });
  });


  // Delete topic handler
  //
  N.wire.on('forum.topic.topic_delete', function topic_delete(event) {
    var $button = $(event.target);

    var data = {
      topicId: $button.data('topic-id'),
      asModerator: $button.data('as-moderator') || false,
      canDeleteHard: N.runtime.page_data.settings.forum_mod_can_hard_delete_topics
    };

    N.wire.emit('forum.topic.topic_delete_dlg', data, function () {
      N.wire.emit('navigate.to', { apiPath: 'forum.section', params: { hid: topicState.section_hid, page: 1 } });
    });
  });


  // Delete post handler
  //
  N.wire.on('forum.topic.post_delete', function post_delete(event) {
    var $button = $(event.currentTarget);
    var postId = $button.data('post-id');
    var $post = $('#post' + postId);

    var data = {
      postId: postId,
      asModerator: $button.data('as-moderator') || false,
      canDeleteHard: N.runtime.page_data.settings.forum_mod_can_hard_delete_topics,
      method: null
    };

    N.wire.emit('forum.topic.post_delete_dlg', data, function () {
      N.io.rpc('forum.topic.list.by_ids', { topic_hid: topicState.topic_hid, posts_ids: [ postId ] })
          .done(function (res) {

        if (res.posts.length === 0) {
          $post.fadeOut(function () {
            $post.remove();
          });

          return;
        }

        $post.replaceWith(N.runtime.render('forum.blocks.posts_list', res));
      });
    });
  });


  // "More posts" button logic
  //
  N.wire.on('forum.topic.append_next_page', function append_next_page(event) {
    var $button = $(event.currentTarget);

    // request for the next page
    N.io.rpc('forum.topic.list.by_page', { topic_hid: topicState.topic_hid, page: topicState.page + 1 })
        .done(function (res) {

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
