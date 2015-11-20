// Forum Topic page logic
//

'use strict';

var _        = require('lodash');
var punycode = require('punycode');
var Bag      = require('bag.js');

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
// - prev_loading_start: time when current xhr request for the previous page is started
// - next_loading_start: time when current xhr request for the next page is started
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
  topicState.prev_loading_start = 0;
  topicState.next_loading_start = 0;


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


  // Update topic menu and modifiers by page data
  //
  function updateTopicState(callback) {
    var params = {};

    N.wire.emit('navigate.get_page_raw', params, function () {

      // Need to re-render reply button and dropdown here
      $('.forum-topic__toolbar-controls')
        .replaceWith(N.runtime.render(module.apiPath + '.blocks.toolbar_controls', params.data));

      var modifiers = {
        'forum-topic-root__m-open': topicStatuses.OPEN,
        'forum-topic-root__m-closed': topicStatuses.CLOSED,
        'forum-topic-root__m-deleted': topicStatuses.DELETED,
        'forum-topic-root__m-deleted-hard': topicStatuses.DELETED_HARD,
        'forum-topic-root__m-pinned': topicStatuses.PINNED
      };

      var $topicRoot = $('.forum-topic-root');

      _.forEach(modifiers, function (state, modifier) {
        if (params.data.topic.st === state || params.data.topic.ste === state) {
          $topicRoot.addClass(modifier);
        } else {
          $topicRoot.removeClass(modifier);
        }
      });

      callback();
    });
  }


  // Expand deleted or hellbanned post
  //
  N.wire.on('forum.topic.post_expand', function post_expand(data) {
    var postId = data.$this.data('post-id');

    N.io.rpc('forum.topic.list.by_ids', { topic_hid: topicState.topic_hid, posts_ids: [ postId ] })
        .done(function (res) {

      var $result = $(N.runtime.render('forum.blocks.posts_list', _.assign(res, { expand: true })));

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
      var params = {};

      N.wire.emit('navigate.get_page_raw', params, function () {
        params.data.topic.st = res.topic.st;
        params.data.topic.ste = res.topic.ste;

        updateTopicState(function () {
          if (unpin) {
            N.wire.emit('notify', { type: 'info', message: t('unpin_topic_done') });
          } else {
            N.wire.emit('notify', { type: 'info', message: t('pin_topic_done') });
          }

          callback();
        });
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
      var pageParams = {};

      N.wire.emit('navigate.get_page_raw', pageParams, function () {
        pageParams.data.topic.st = res.topic.st;
        pageParams.data.topic.ste = res.topic.ste;

        updateTopicState(function () {
          if (params.reopen) {
            N.wire.emit('notify', { type: 'info', message: t('open_topic_done') });
          } else {
            N.wire.emit('notify', { type: 'info', message: t('close_topic_done') });
          }

          callback();
        });
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
        value = value.trim();

        if (punycode.ucs2.decode(value).length < N.runtime.page_data.settings.forum_topic_title_min_length) {
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
          $title.text(value);

          // update title in navbar
          $('.navbar-alt__title').text(value);

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
      var params = {};

      N.wire.emit('navigate.get_page_raw', params, function () {
        params.data.topic.st = res.topic.st;
        params.data.topic.ste = res.topic.ste;

        updateTopicState(function () {
          N.wire.emit('notify', { type: 'info', message: t('undelete_topic_done') });
          callback();
        });
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
        var $result = $(N.runtime.render('forum.blocks.posts_list', res));

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


  // Subscription topic handler
  //
  N.wire.on('forum.topic:subscription', function topic_subscription(data, callback) {
    var hid = data.$this.data('topic-hid');
    var params = { subscription: data.$this.data('topic-subscription') };

    N.wire.emit('forum.topic.topic_subscription', params, function () {
      N.io.rpc('forum.topic.subscribe', { topic_hid: hid, type: params.subscription }).done(function () {
        var pageParams = {};

        N.wire.emit('navigate.get_page_raw', pageParams, function () {
          pageParams.data.subscription = params.subscription;

          updateTopicState(callback);
        });
      });
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

        var $result = $(N.runtime.render('forum.blocks.posts_list', res));

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

  // an amount of time between successful xhr requests and failed xhr requests respectively
  //
  // For example, suppose user continuously scrolls. If server is up, each
  // subsequent request will be sent each 500 ms. If server goes down, the
  // interval between request initiations goes up to 2000 ms.
  //
  var LOAD_INTERVAL = 500;
  var LOAD_AFTER_ERROR = 2000;

  // an amount of posts from top/bottom that triggers prefetch in that direction
  var LOAD_BORDER_SIZE = 3;

  function _load_prev_page() {
    var now = Date.now();

    // `prev_loading_start` is the last request start time, which is reset to 0 on success
    //
    // Thus, successful requests can restart immediately, but failed ones
    // will have to wait `LOAD_AFTER_ERROR` ms.
    //
    if (Math.abs(topicState.prev_loading_start - now) < LOAD_AFTER_ERROR) { return; }

    topicState.prev_loading_start = now;

    var hid = $('.forum-post:first').data('post-hid');

    if (!hid) {
      // No posts on the page
      return;
    }

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

      topicState.prev_loading_start = 0;

    }).fail(N.io.NOT_FOUND, function () {
      // Topic moved or deleted, refreshing the page so user could
      // see the error
      //
      N.wire.emit('navigate.reload');
    });
  }

  function _load_next_page() {
    var now = Date.now();

    // `next_loading_start` is the last request start time, which is reset to 0 on success
    //
    // Thus, successful requests can restart immediately, but failed ones
    // will have to wait `LOAD_AFTER_ERROR` ms.
    //
    if (Math.abs(topicState.next_loading_start - now) < LOAD_AFTER_ERROR) { return; }

    topicState.next_loading_start = now;

    var hid = $('.forum-post:last').data('post-hid');

    if (!hid) {
      // No posts on the page
      return;
    }

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

      topicState.next_loading_start = 0;

    }).fail(N.io.NOT_FOUND, function () {
      // Topic moved or deleted, refreshing the page so user could
      // see the error
      //
      N.wire.emit('navigate.reload');
    });
  }

  var load_prev_page = _.debounce(_load_prev_page, LOAD_INTERVAL, { leading: true, maxWait: LOAD_INTERVAL });
  var load_next_page = _.debounce(_load_next_page, LOAD_INTERVAL, { leading: true, maxWait: LOAD_INTERVAL });

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
      subscription:   N.runtime.page_data.subscription,

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


///////////////////////////////////////////////////////////////////////////////
// Set a "same page" modifier to all block quotes which point to the same topic
//

// current topic params if we're on the topic page, null otherwise;
var topicParams;


// Set `quote__m-local` or `quote__m-outer` class on every quote
// depending on whether its origin is in the same topic or not.
//
function set_quote_modifiers(selector) {
  // if topicParams is not set, it means we aren't on a topic page
  if (!topicParams) { return; }

  selector.find('.quote').addBack('.quote').each(function () {
    var $tag = $(this);

    if ($tag.hasClass('quote__m-local') || $tag.hasClass('quote__m-outer')) {
      return;
    }

    var cite = $tag.attr('cite');

    if (!cite) { return; }

    var match = N.router.match(cite);

    if (!match) { return; }

    if (match &&
        match.meta.methods.get === 'forum.topic' &&
        match.params.topic_hid === topicParams.topic_hid) {

      $tag.addClass('quote__m-local');
    } else {
      $tag.addClass('quote__m-outer');
    }
  });
}


N.wire.on('navigate.done:' + module.apiPath, function set_quote_modifiers_on_init(data) {
  topicParams = data.params;

  set_quote_modifiers($(document));
});


N.wire.on('navigate.update', function set_quote_modifiers_on_update(data) {
  set_quote_modifiers(data.$);
});


N.wire.on('navigate.exit:' + module.apiPath, function set_quote_modifiers_teardown() {
  topicParams = null;
});


///////////////////////////////////////////////////////////////////////////////
// Save scroll position
//
var bag = new Bag({ prefix: 'nodeca' });
var scrollPositionTracker = null;


var uploadScrollPositions = _.debounce(function () {
  bag.get('topics_scroll', function (__, positions) {
    if (positions) {
      _.forEach(positions, function (data, id) {
        N.live.emit('private.forum.marker_set_pos', {
          content_id: id,
          position: data.pos,
          max: data.max,
          category_id: data.category_id
        });
      });

      bag.remove('topics_scroll');
    }
  });
}, 2000);


// Track scroll position
//
N.wire.on('navigate.done:' + module.apiPath, function save_scroll_position_init() {
  // Skip for guests
  if (N.runtime.is_guest) {
    return;
  }

  var lastPos = -1;
  var lastRead = -1;

  scrollPositionTracker = _.debounce(function () {
    var $window = $(window);
    var viewportStart = $window.scrollTop() + navbarHeight;
    var viewportEnd = $window.scrollTop() + $window.height();
    var $posts = $('.forum-post');

    var currentIdx = _.sortedIndex($posts, null, function (post) {
      if (!post) { return viewportStart; }
      return $(post).offset().top + $(post).height();
    });

    if (currentIdx >= $posts.length) {
      currentIdx = $posts.length - 1;
    }

    var lastVisibleIdx = $posts.length - 1;

    // Search last completely visible post
    for (var i = currentIdx + 1; i < $posts.length; i++) {
      if ($($posts[i]).offset().top + $($posts[i]).height() > viewportEnd) {
        lastVisibleIdx = i - 1;
        break;
      }
    }

    if (lastVisibleIdx < 0) {
      // No posts on the page
      return;
    }

    // Last completely visible post on page to mark it as read
    var read = $($posts[lastVisibleIdx]).data('post-hid');
    // Current scroll (topic hid) position
    var pos;

    var $post = $($posts[currentIdx]);

    // If first post in viewport hidden more than half height and second post is
    // completely visible - set `pos` to second post hid
    if ($post.offset().top + $post.height() / 2 < viewportStart && lastVisibleIdx > currentIdx) {
      pos = $($posts[currentIdx + 1]).data('post-hid');
    } else {
      pos = $post.data('post-hid');
    }

    if (lastPos === pos && lastRead === read) {
      return;
    }

    lastPos = pos;
    lastRead = read;

    // Save current position locally and request upload
    bag.get('topics_scroll', function (__, positions) {
      positions = positions || {};
      positions[N.runtime.page_data.topic._id] = {
        pos: pos,
        max: read,
        category_id: N.runtime.page_data.topic.section
      };

      bag.set('topics_scroll', positions, function () {
        uploadScrollPositions();
      });
    });
  }, 300, { maxWait: 300 });

  $(window).on('scroll', scrollPositionTracker);
});


// Try upload scroll positions on each `navigate.done`
//
N.wire.on('navigate.done', uploadScrollPositions);


// Teardown scroll handler
//
N.wire.on('navigate.exit:' + module.apiPath, function save_scroll_position_teardown() {
  if (scrollPositionTracker) {
    scrollPositionTracker.cancel();
  }

  $(window).off('scroll', scrollPositionTracker);
  scrollPositionTracker = null;
});
