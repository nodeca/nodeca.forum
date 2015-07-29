// Forum Topic page logic
//

'use strict';

var _        = require('lodash');
var punycode = require('punycode');

var topicStatuses = '$$ JSON.stringify(N.models.forum.Topic.statuses) $$';


// Topic state
//
// - section_hid:        current section hid
// - topic_hid:          current topic hid
// - post_hid:           current post hid
// - max_post:           hid of the last post in this topic
// - posts_per_page:     an amount of visible posts per page
// - first_post_offset:  total amount of visible posts in the topic before the first displayed post
// - last_post_offset:   total amount of visible posts in the topic before the last displayed post
// - prev_page_loading:  true iff request to auto-load previous page is in flight
// - next_page_loading:  true iff request to auto-load next page is in flight
//
var topicState = {};
var scrollHandler = null;
var navbarHeight = $('.navbar').height();


/////////////////////////////////////////////////////////////////////
// init on page load and destroy editor on window unload
//
N.wire.on('navigate.done:' + module.apiPath, function page_setup(data) {
  topicState.section_hid        = data.params.section_hid;
  topicState.topic_hid          = data.params.topic_hid;
  topicState.post_hid           = data.params.post_hid || 1;
  topicState.posts_per_page     = N.runtime.page_data.pagination.per_page;
  topicState.max_post           = N.runtime.page_data.topic.last_post_hid;
  topicState.first_post_offset  = N.runtime.page_data.pagination.chunk_offset;
  topicState.last_post_offset   = N.runtime.page_data.pagination.chunk_offset + $('.forum-post').length - 1;
  topicState.prev_page_loading  = false;
  topicState.next_page_loading  = false;


  // If user moves to a page (e.g. from a search engine),
  // we should scroll him to the top post on that page
  //
  if (data.params.page && data.params.page > 1) {
    topicState.post_hid = $('.forum-post:first').data('post-hid');
  }


  // Scroll to a post linked in params (if any)
  //
  if (topicState.post_hid > 1) {
    var posts = $('.forum-post');
    var i = _.sortedIndex(posts, null, function (post) {
      if (!post) { return topicState.post_hid; }
      return $(post).data('post-hid');
    });

    // `i` is the index of a post with given hid if it exists,
    // otherwise it's a position of the first post with hid more than that
    //
    if (i >= posts.length) { i = posts.length - 1; }
    $(window).scrollTop($(posts[i]).offset().top - navbarHeight);

  } else {
    // If user clicks on a link to the first post of the topic,
    // we should scroll to the top.
    //
    $(window).scrollTop(0);
  }

  // disable automatic scroll to an anchor in the navigator
  data.no_scroll = true;
});


/////////////////////////////////////////////////////////////////////
// Show/hide navbar when user scrolls the page,
// and generate debounced "scroll" event
//
N.wire.on('navigate.done:' + module.apiPath, function scroll_tracker_init() {
  scrollHandler = _.debounce(function update_location_on_scroll() {
    var viewportStart = $(window).scrollTop() + navbarHeight;

    // If we scroll below top border of the first post,
    // show the secondary navbar
    //
    if ($('.forum-postlist').offset().top < viewportStart) {
      $('.navbar').addClass('navbar__m-secondary');
    } else {
      $('.navbar').removeClass('navbar__m-secondary');
    }

    N.wire.emit('forum.topic:scroll');
  }, 100, { maxWait: 100 });

  $(window).on('scroll', scrollHandler);
});

N.wire.on('navigate.exit:' + module.apiPath, function scroll_tracker_teardown() {
  scrollHandler.cancel();
  $(window).off('scroll', scrollHandler);
  scrollHandler = null;
});


/////////////////////////////////////////////////////////////////////
// setup 'forum.topic.*' handlers
//
N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  // Click on post reply link or toolbar reply button
  //
  N.wire.on('forum.topic:reply', function reply(data, callback) {
    N.wire.emit('forum.topic.reply:begin', {
      topic_hid: topicState.topic_hid,
      topic_title: N.runtime.page_data.topic.title,
      section_hid: topicState.section_hid,
      post_id: data.$this.data('post-id'),
      post_hid: data.$this.data('post-hid')
    }, callback);
  });


  // Click on post edit
  //
  N.wire.on('forum.topic:post_edit', function reply(data, callback) {
    N.wire.emit('forum.topic.post.edit:begin', {
      topic_hid: topicState.topic_hid,
      topic_title: N.runtime.page_data.topic.title,
      section_hid: topicState.section_hid,
      post_id: data.$this.data('post-id'),
      post_hid: data.$this.data('post-hid'),
      as_moderator: data.$this.data('as-moderator') || false
    }, callback);
  });


  // Show post IP
  //
  N.wire.on('forum.topic.post_show_ip', function post_show_ip(data) {
    var postId = data.$this.data('post-id');

    N.wire.emit('forum.topic.ip_info_dlg', { postId: postId });
  });


  // Update topic menu and modifiers for new topic state
  //
  // topic:
  // - st
  // - ste
  //
  function updateTopic(topic, callback) {
    var params = {};

    N.wire.emit('navigate.get_page_raw', params, function () {
      // - reset previous `st` and `ste`
      // - set new `st` and `ste`
      var pageData = _.merge({}, params.data, { topic: { st: null, ste: null } }, { topic: topic });

      // Need to re-render reply button and dropdown here
      $('.navbar-alt')
        .empty()
        .append(N.runtime.render(module.apiPath + '.navbar_alt', {
          settings:       pageData.settings,
          topic:          pageData.topic,
          section_hid:    topicState.section_hid,
          topic_statuses: topicStatuses,

          page_progress: {
            section_hid: topicState.section_hid,
            topic_hid:   topicState.topic_hid,
            current:     topicState.post_hid,
            max:         topicState.max_post
          }
        }));

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
  }


  // Expand deleted or hellbanned post
  //
  N.wire.on('forum.topic.post_expand', function post_expand(data) {
    var postId = data.$this.data('post-id');

    N.io.rpc('forum.topic.list.by_ids', { topic_hid: topicState.topic_hid, posts_ids: [ postId ] })
        .done(function (res) {

      var $result = N.runtime.render('forum.blocks.posts_list', _.assign(res, { expand: true }));

      N.wire.emit('navigate.update', { $: $result, locals: res }, function () {
        $('#post' + postId).replaceWith($result);
      });
    });
  });


  // Pin/unpin topic
  //
  N.wire.on('forum.topic.pin', function topic_pin(data, callback) {
    var topicId = data.$this.data('topic-id');
    var unpin = data.$this.data('unpin') || false;

    N.io.rpc('forum.topic.pin', { topic_id: topicId, unpin: unpin }).done(function (res) {
      updateTopic(res.topic, function () {
        if (unpin) {
          N.wire.emit('notify', { type: 'info', message: t('unpin_topic_done') });
        } else {
          N.wire.emit('notify', { type: 'info', message: t('pin_topic_done') });
        }

        callback();
      });
    });
  });


  // Close/open topic handler
  //
  N.wire.on('forum.topic.close', function topic_close(data, callback) {
    var params = {
      topic_id: data.$this.data('topic-id'),
      reopen: data.$this.data('reopen') || false,
      as_moderator: data.$this.data('as-moderator') || false
    };

    N.io.rpc('forum.topic.close', params).done(function (res) {
      updateTopic(res.topic, function () {
        if (params.reopen) {
          N.wire.emit('notify', { type: 'info', message: t('open_topic_done') });
        } else {
          N.wire.emit('notify', { type: 'info', message: t('close_topic_done') });
        }
        callback();
      });
    });
  });


  // Edit title handler
  //
  N.wire.on('forum.topic.edit_title', function title_edit(data, callback) {
    var $title = $('.forum-topic-title__text');

    var params = {
      selector: '.forum-topic-title',
      value: $title.text(),
      update: function (value, callback) {

        if (punycode.ucs2.decode(value.trim()).length < N.runtime.page_data.settings.forum_topic_title_min_length) {
          callback(t('err_title_too_short', N.runtime.page_data.settings.forum_topic_title_min_length));
          return;
        }

        // If value is equals to old value - close `microedit` without request
        if (value === $title.text()) {
          callback();
          return;
        }

        N.io.rpc('forum.topic.title_update', {
          as_moderator: data.$this.data('as-moderator') || false,
          topic_id: data.$this.data('topic-id'),
          title: value
        }).done(function () {
          $title.text(value.trim());
          callback();
        });
      }
    };

    N.wire.emit('common.blocks.microedit', params, callback);
  });


  // Undelete topic handler
  //
  N.wire.on('forum.topic.topic_undelete', function topic_undelete(data, callback) {
    var topicId = data.$this.data('topic-id');

    N.io.rpc('forum.topic.undelete', { topic_id: topicId }).done(function (res) {
      updateTopic(res.topic, function () {
        N.wire.emit('notify', { type: 'info', message: t('undelete_topic_done') });
        callback();
      });
    });
  });


  // Vote post
  //
  N.wire.on('forum.topic.post_vote', function post_vote(data, callback) {
    var postId = data.$this.data('post-id');
    var value = +data.$this.data('value');
    var $post = $('#post' + postId);
    var topicHid = topicState.topic_hid;

    N.io.rpc('forum.topic.post.vote', { post_id: postId, value: value }).done(function () {

      // Update whole post to correctly update votes counters and modifiers
      N.io.rpc('forum.topic.list.by_ids', { topic_hid: topicHid, posts_ids: [ postId ] }).done(function (res) {
        var $result = N.runtime.render('forum.blocks.posts_list', res);

        N.wire.emit('navigate.update', { $: $result, locals: res }, function () {
          $post.replaceWith($result);
          callback();
        });
      });
    });
  });


  // Undelete post handler
  //
  N.wire.on('forum.topic.post_undelete', function post_undelete(data, callback) {
    var postId = data.$this.data('post-id');

    N.io.rpc('forum.topic.post.undelete', { post_id: postId }).done(function () {
      $('#post' + postId)
        .removeClass('forum-post__m-deleted')
        .removeClass('forum-post__m-deleted-hard');

      callback();
    });
  });


  // Delete topic handler
  //
  N.wire.on('forum.topic.topic_delete', function topic_delete(data) {
    var params = {
      topicId: data.$this.data('topic-id'),
      asModerator: data.$this.data('as-moderator') || false,
      canDeleteHard: N.runtime.page_data.settings.forum_mod_can_hard_delete_topics
    };

    N.wire.emit('forum.topic.topic_delete_dlg', params, function () {
      N.wire.emit('navigate.to', { apiPath: 'forum.section', params: { hid: topicState.section_hid, page: 1 } });
    });
  });


  // Delete post handler
  //
  N.wire.on('forum.topic.post_delete', function post_delete(data, callback) {
    var postId = data.$this.data('post-id');
    var $post = $('#post' + postId);

    var params = {
      postId: postId,
      asModerator: data.$this.data('as-moderator') || false,
      canDeleteHard: N.runtime.page_data.settings.forum_mod_can_hard_delete_topics,
      method: null
    };

    N.wire.emit('forum.topic.post_delete_dlg', params, function () {
      N.io.rpc('forum.topic.list.by_ids', { topic_hid: topicState.topic_hid, posts_ids: [ postId ] })
          .done(function (res) {

        if (res.posts.length === 0) {
          $post.fadeOut(function () {
            $post.remove();
          });

          callback();
          return;
        }

        var $result = N.runtime.render('forum.blocks.posts_list', res);

        N.wire.emit('navigate.update', { $: $result, locals: res }, function () {
          $post.replaceWith($result);
          callback();
        });
      });
    });
  });


  // Add/remove bookmark
  //
  N.wire.on('forum.topic.post_bookmark', function post_bookmark(data, callback) {
    var postId = data.$this.data('post-id');
    var remove = data.$this.data('remove') || false;
    var $post = $('#post' + postId);

    N.io.rpc('forum.topic.post.bookmark', { post_id: postId, remove: remove }).done(function (res) {
      if (remove) {
        $post.removeClass('forum-post__m-bookmarked');
      } else {
        $post.addClass('forum-post__m-bookmarked');
      }

      callback();
      $post.find('.forum-post__bookmarks-count').attr('data-bm-count', res.count);
    });
  });


  ///////////////////////////////////////////////////////////////////////////
  // Whenever we are close to beginning/end of post list, check if we can
  // load more pages from the server
  //

  // an amount of posts we try to load when user scrolls to the end of the page
  var LOAD_POSTS_COUNT = N.runtime.page_data.pagination.per_page;

  // an amount of posts from top/bottom that triggers prefetch in that direction
  var LOAD_BORDER_SIZE = 3;

  function _load_prev_page() {
    if (topicState.prev_page_loading) { return; }
    topicState.prev_page_loading = true;

    var hid = $('.forum-post:first').data('post-hid');
    if (hid <= 1) {
      // If the first post on the page is hid=1, it's a first page,
      // so we don't need to load anything
      //
      // This is sufficient because post with hid=1 always exists.
      //
      return;
    }

    N.io.rpc('forum.topic.list.by_range', {
      topic_hid: topicState.topic_hid,
      post_hid:  hid - 1,
      before:    LOAD_POSTS_COUNT,
      after:     0
    }).done(function (res) {
      if (res.last_post_hid && res.last_post_hid !== topicState.max_post) {
        topicState.max_post = res.last_post_hid;

        N.wire.emit('forum.topic.blocks.page_progress:update', {
          max: topicState.max_post
        });
      }

      if (!res.posts || !res.posts.length) {
        return;
      }

      var old_height = $('.forum-postlist').height();

      topicState.first_post_offset -= res.posts.length;

      res.pagination = {
        // used in paginator
        total:        N.runtime.page_data.pagination.total,
        per_page:     N.runtime.page_data.pagination.per_page,
        chunk_offset: topicState.first_post_offset
      };

      // render & inject posts list
      var $result = $(N.runtime.render('forum.blocks.posts_list', res));

      N.wire.emit('navigate.update', { $: $result, locals: res }, function () {
        $('.forum-postlist > :first').before($result);

        // update scroll so it would point at the same spot as before
        $(window).scrollTop($(window).scrollTop() + $('.forum-postlist').height() - old_height);
      });

    }).fail(N.io.NOT_FOUND, function () {
      // Topic moved or deleted, refreshing the page so user could
      // see the error
      //
      N.wire.emit('navigate.reload');

    }).finish(function () {
      topicState.prev_page_loading = false;
    });
  }

  function _load_next_page() {
    if (topicState.next_page_loading) { return; }
    topicState.next_page_loading = true;

    var hid = $('.forum-post:last').data('post-hid');
    if (hid >= topicState.max_post) {
      // If the last post on the page is visible, no need to scroll further.
      //
      return;
    }

    N.io.rpc('forum.topic.list.by_range', {
      topic_hid: topicState.topic_hid,
      post_hid:  hid + 1,
      before:    0,
      after:     LOAD_POSTS_COUNT
    }).done(function (res) {
      if (res.last_post_hid && res.last_post_hid !== topicState.max_post) {
        topicState.max_post = res.last_post_hid;

        N.wire.emit('forum.topic.blocks.page_progress:update', {
          max: topicState.max_post
        });
      }

      if (!res.posts || !res.posts.length) {
        return;
      }

      res.pagination = {
        // used in paginator
        total:        N.runtime.page_data.pagination.total,
        per_page:     N.runtime.page_data.pagination.per_page,
        chunk_offset: topicState.last_post_offset + 1
      };

      topicState.last_post_offset += res.posts.length;

      // render & inject posts list
      var $result = $(N.runtime.render('forum.blocks.posts_list', res));

      N.wire.emit('navigate.update', { $: $result, locals: res }, function () {
        $('.forum-postlist > :last').after($result);
      });

    }).fail(N.io.NOT_FOUND, function () {
      // Topic moved or deleted, refreshing the page so user could
      // see the error
      //
      N.wire.emit('navigate.reload');

    }).finish(function () {
      topicState.next_page_loading = false;
    });
  }

  var load_prev_page = _.debounce(_load_prev_page, 500, { leading: true, maxWait: 500 });
  var load_next_page = _.debounce(_load_next_page, 500, { leading: true, maxWait: 500 });

  // If we're browsing one of the first/last 3 posts, load more pages from
  // the server in that direction.
  //
  // This method is synchronous, so rpc requests won't delay progress bar
  // updates.
  //
  N.wire.on('forum.topic:scroll', function check_load_more_pages() {
    var posts         = $('.forum-post'),
        viewportStart = $(window).scrollTop() + navbarHeight,
        viewportEnd   = $(window).scrollTop() + $(window).height();

    if (posts.length <= LOAD_BORDER_SIZE || $(posts[posts.length - LOAD_BORDER_SIZE]).offset().top < viewportEnd) {
      load_next_page();
    }

    if (posts.length <= LOAD_BORDER_SIZE || $(posts[LOAD_BORDER_SIZE]).offset().top > viewportStart) {
      load_prev_page();
    }
  });


  // Update location and progress bar
  //
  N.wire.on('forum.topic:scroll', function update_progress() {
    var posts         = $('.forum-post'),
        viewportStart = $(window).scrollTop() + navbarHeight,
        newHid,
        currentIdx;

    // Get offset of the first post in the viewport
    //
    currentIdx = _.sortedIndex(posts, null, function (post) {
      if (!post) { return viewportStart; }
      return $(post).offset().top + $(post).height();
    });

    if (currentIdx >= posts.length) { currentIdx = posts.length - 1; }

    newHid = $(posts[currentIdx]).data('post-hid');
    if (newHid === topicState.post_hid) { return; }

    topicState.post_hid = newHid;

    N.wire.emit('navigate.replace', {
      href: N.router.linkTo('forum.topic', {
        section_hid:  topicState.section_hid,
        topic_hid:    topicState.topic_hid,
        post_hid:     topicState.post_hid
      })
    });

    N.wire.emit('forum.topic.blocks.page_progress:update', {
      current:     topicState.post_hid,
      max:         topicState.max_post
    });
  });


  // User clicks submits dropdown menu form and is moved to
  // a corresponding post
  //
  N.wire.on('forum.topic:nav_to_post', function navigate_to_post(data) {
    var post = +data.fields.post;
    if (!post) { return; }

    N.wire.emit('navigate.to', {
      apiPath: 'forum.topic',
      params: {
        section_hid:  topicState.section_hid,
        topic_hid:    topicState.topic_hid,
        post_hid:     post
      }
    });
  });


  // User presses "home" button
  //
  N.wire.on('forum.topic:nav_to_start', function navigate_to_start() {
    var hid = $('.forum-post:first').data('post-hid');

    // if the first post is already loaded, scroll to the top
    if (hid <= 1) {
      $(window).scrollTop(0);
      return;
    }

    N.wire.emit('navigate.to', {
      apiPath: 'forum.topic',
      params: {
        section_hid:  topicState.section_hid,
        topic_hid:    topicState.topic_hid,
        post_hid:     1
      }
    });
  });


  // User presses "end" button
  //
  N.wire.on('forum.topic:nav_to_end', function navigate_to_end() {
    var hid = $('.forum-post:last').data('post-hid');

    // if the last post is already loaded, scroll to the bottom
    if (hid >= topicState.max_post) {
      $(window).scrollTop($('.forum-post:last').offset().top - navbarHeight);
      return;
    }

    // Note: this will scroll to the last post, not to the real bottom like
    // browsers do. There is a difference if footer is large enough.
    //
    N.wire.emit('navigate.to', {
      apiPath: 'forum.topic',
      params: {
        section_hid:  topicState.section_hid,
        topic_hid:    topicState.topic_hid,
        post_hid:     topicState.max_post
      }
    });
  });


  // User clicks to "move back to section" button, and she is moved
  // to a section page where this topic is centered and highlighted
  //
  N.wire.on('forum.topic:level_up', function level_up(data) {
    N.io.rpc('forum.topic.offset', {
      section_hid: topicState.section_hid,
      topic_id: data.$this.data('topic-id')
    }).done(function (res) {
      var page = Math.floor(res.topic_offset / res.topics_per_page) + 1;

      N.wire.emit('navigate.to', {
        apiPath: 'forum.section',
        params: {
          hid:   topicState.section_hid,
          page:  page
        },
        anchor: 'topic' + data.$this.data('topic-id')
      });
    });
  });
});


//////////////////////////////////////////////////////////////////////////
// Replace primary navbar with alt navbar specific to this page
//
N.wire.on('navigate.done:' + module.apiPath, function navbar_setup() {
  $('.navbar-alt')
    .empty()
    .append(N.runtime.render(module.apiPath + '.navbar_alt', {
      settings:       N.runtime.page_data.settings,
      topic:          N.runtime.page_data.topic,
      section_hid:    topicState.section_hid,
      topic_statuses: topicStatuses,

      page_progress: {
        section_hid: topicState.section_hid,
        topic_hid:   topicState.topic_hid,
        current:     topicState.post_hid,
        max:         topicState.max_post
      }
    }));

  var viewportStart = $(window).scrollTop() + navbarHeight;

  // If we scroll below top border of the first post,
  // show the secondary navbar
  //
  if ($('.forum-postlist').offset().top < viewportStart) {
    $('.navbar').addClass('navbar__m-secondary');
  } else {
    $('.navbar').removeClass('navbar__m-secondary');
  }

  N.wire.emit('forum.topic:scroll');
});

N.wire.on('navigate.exit:' + module.apiPath, function navbar_teardown() {
  $('.navbar-alt').empty();
  $('.navbar').removeClass('navbar__m-secondary');
});
