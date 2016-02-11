// Forum Topic page logic
//
'use strict';


const _             = require('lodash');
const punycode      = require('punycode');
const topicStatuses = '$$ JSON.stringify(N.models.forum.Topic.statuses) $$';


// Topic state
//
// - section_hid:        current section hid
// - topic_hid:          current topic hid
// - post_hid:           current post hid
// - max_post:           hid of the last post in this topic
// - post_count:         an amount of visible posts in the topic
// - posts_per_page:     an amount of visible posts per page
// - first_post_offset:  total amount of visible posts in the topic before the first displayed post
// - last_post_offset:   total amount of visible posts in the topic before the last displayed post
// - prev_loading_start: time when current xhr request for the previous page is started
// - next_loading_start: time when current xhr request for the next page is started
// - selected_posts:     array of selected posts in current topic
//
let topicState = {};
let scrollHandler = null;
let navbarHeight = $('.navbar').height();


/////////////////////////////////////////////////////////////////////
// init on page load and destroy editor on window unload
//
N.wire.on('navigate.done:' + module.apiPath, function page_setup(data) {
  topicState.section_hid        = data.params.section_hid;
  topicState.topic_hid          = data.params.topic_hid;
  topicState.post_hid           = data.params.post_hid || 1;
  topicState.post_count         = N.runtime.page_data.pagination.total;
  topicState.posts_per_page     = N.runtime.page_data.pagination.per_page;
  topicState.max_post           = N.runtime.page_data.max_post;
  topicState.first_post_offset  = N.runtime.page_data.pagination.chunk_offset;
  topicState.last_post_offset   = N.runtime.page_data.pagination.chunk_offset + $('.forum-post').length - 1;
  topicState.prev_loading_start = 0;
  topicState.next_loading_start = 0;
  topicState.selected_posts     = [];


  // If user moves to a page (e.g. from a search engine),
  // we should scroll him to the top post on that page
  //
  if (data.params.page && data.params.page > 1) {
    topicState.post_hid = $('.forum-post:first').data('post-hid');
  }


  // Scroll to a post linked in params (if any)
  //
  if (topicState.post_hid > 1) {
    let posts = $('.forum-post');
    let i = _.sortedIndexBy(posts, null, post => {
      if (!post) return topicState.post_hid;
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
    let viewportStart = $(window).scrollTop() + navbarHeight;

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
// Update topic menu and modifiers by page data
//
function updateTopicState() {
  let params = {};

  return N.wire.emit('navigate.get_page_raw', params).then(() => {
    let data = _.assign({}, params.data, { selected_cnt: topicState.selected_posts.length });

    // Need to re-render reply button and dropdown here
    $('.forum-topic__toolbar-controls')
      .replaceWith(N.runtime.render(module.apiPath + '.blocks.toolbar_controls', data));

    let modifiers = {
      'forum-topic-root__m-open': topicStatuses.OPEN,
      'forum-topic-root__m-closed': topicStatuses.CLOSED,
      'forum-topic-root__m-deleted': topicStatuses.DELETED,
      'forum-topic-root__m-deleted-hard': topicStatuses.DELETED_HARD,
      'forum-topic-root__m-pinned': topicStatuses.PINNED
    };

    let $topicRoot = $('.forum-topic-root');

    _.forEach(modifiers, (state, modifier) => {
      if (params.data.topic.st === state || params.data.topic.ste === state) {
        $topicRoot.addClass(modifier);
      } else {
        $topicRoot.removeClass(modifier);
      }
    });
  });
}


/////////////////////////////////////////////////////////////////////
// setup 'forum.topic.*' handlers
//
N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  // Click on post reply link or toolbar reply button
  //
  N.wire.on(module.apiPath + ':reply', function reply(data) {
    return N.wire.emit('forum.topic.reply:begin', {
      topic_hid: topicState.topic_hid,
      topic_title: N.runtime.page_data.topic.title,
      section_hid: topicState.section_hid,
      post_id: data.$this.data('post-id'),
      post_hid: data.$this.data('post-hid')
    });
  });


  // Click on post edit
  //
  N.wire.on(module.apiPath + ':post_edit', function reply(data) {
    return N.wire.emit('forum.topic.post.edit:begin', {
      topic_hid: topicState.topic_hid,
      topic_title: N.runtime.page_data.topic.title,
      section_hid: topicState.section_hid,
      post_id: data.$this.data('post-id'),
      post_hid: data.$this.data('post-hid'),
      as_moderator: data.$this.data('as-moderator') || false
    });
  });


  // Show post IP
  //
  N.wire.on(module.apiPath + '.post_show_ip', function post_show_ip(data) {
    return N.wire.emit('forum.topic.ip_info_dlg', { postId: data.$this.data('post-id') });
  });


  // Expand deleted or hellbanned post
  //
  N.wire.on(module.apiPath + '.post_expand', function post_expand(data) {
    let postId = data.$this.data('post-id');

    return Promise.resolve()
      .then(() => N.io.rpc('forum.topic.list.by_ids', { topic_hid: topicState.topic_hid, posts_ids: [ postId ] }))
      .then(res => {
        let $result = $(N.runtime.render('forum.blocks.posts_list', _.assign(res, { expand: true })));

        return N.wire.emit('navigate.update', { $: $result, locals: res })
          .then(() => $('#post' + postId).replaceWith($result));
      });
  });


  // Pin/unpin topic
  //
  N.wire.on(module.apiPath + '.pin', function topic_pin(data) {
    let topicHid = data.$this.data('topic-hid');
    let unpin = data.$this.data('unpin') || false;
    let params = {};

    return Promise.resolve()
      .then(() => N.wire.emit('navigate.get_page_raw', params))
      .then(() => N.io.rpc('forum.topic.pin', { topic_hid: topicHid, unpin }))
      .then(res => {
        params.data.topic.st = res.topic.st;
        params.data.topic.ste = res.topic.ste;
      })
      .then(updateTopicState)
      .then(() => {
        if (unpin) return N.wire.emit('notify', { type: 'info', message: t('unpin_topic_done') });
        return N.wire.emit('notify', { type: 'info', message: t('pin_topic_done') });
      });
  });


  // Close/open topic handler
  //
  N.wire.on(module.apiPath + '.close', function topic_close(data) {
    let params = {
      topic_hid: data.$this.data('topic-hid'),
      reopen: data.$this.data('reopen') || false,
      as_moderator: data.$this.data('as-moderator') || false
    };
    let pageParams = {};

    return Promise.resolve()
      .then(() => N.wire.emit('navigate.get_page_raw', pageParams))
      .then(() => N.io.rpc('forum.topic.close', params))
      .then(res => {
        pageParams.data.topic.st = res.topic.st;
        pageParams.data.topic.ste = res.topic.ste;
      })
      .then(updateTopicState)
      .then(() => {
        if (params.reopen) return N.wire.emit('notify', { type: 'info', message: t('open_topic_done') });
        return N.wire.emit('notify', { type: 'info', message: t('close_topic_done') });
      });
  });


  // Edit title handler
  //
  N.wire.on(module.apiPath + '.edit_title', function title_edit(data) {
    let forum_topic_title_min_length = N.runtime.page_data.settings.forum_topic_title_min_length;
    let $title = $('.forum-topic-title__text');
    let params = {
      selector: '.forum-topic-title',
      value: $title.text(),
      update(value) {
        value = value.trim();

        if (punycode.ucs2.decode(value).length < forum_topic_title_min_length) {
          return Promise.reject(t('err_title_too_short', forum_topic_title_min_length));
        }

        // If value is equals to old value - close `microedit` without request
        if (value === $title.text()) {
          return Promise.resolve();
        }

        return N.io.rpc('forum.topic.title_update', {
          as_moderator: data.$this.data('as-moderator') || false,
          topic_hid: data.$this.data('topic-hid'),
          title: value
        }).then(() => {
          $title.text(value);

          // update title in navbar
          $('.navbar-alt__title').text(value);
        });
      }
    };

    return N.wire.emit('common.blocks.microedit', params);
  });


  // Undelete topic handler
  //
  N.wire.on(module.apiPath + '.topic_undelete', function topic_undelete(data) {
    let topicHid = data.$this.data('topic-hid');
    let params = {};

    return Promise.resolve()
      .then(() => N.wire.emit('navigate.get_page_raw', params))
      .then(() => N.io.rpc('forum.topic.undelete', { topic_hid: topicHid }))
      .then(res => {
        params.data.topic.st = res.topic.st;
        params.data.topic.ste = res.topic.ste;
      })
      .then(updateTopicState)
      .then(() => N.wire.emit('notify', { type: 'info', message: t('undelete_topic_done') }));
  });


  // Vote post
  //
  N.wire.on(module.apiPath + '.post_vote', function post_vote(data) {
    let postId = data.$this.data('post-id');
    let value = +data.$this.data('value');
    let $post = $('#post' + postId);
    let topicHid = topicState.topic_hid;
    let $result;

    return Promise.resolve()
      .then(() => N.io.rpc('forum.topic.post.vote', { post_id: postId, value }))
      .then(() => N.io.rpc('forum.topic.list.by_ids', { topic_hid: topicHid, posts_ids: [ postId ] }))
      .then(res => {
        $result = $(N.runtime.render('forum.blocks.posts_list', res));

        return N.wire.emit('navigate.update', { $: $result, locals: res });
      })
      .then(() => $post.replaceWith($result));
  });


  // Undelete post handler
  //
  N.wire.on(module.apiPath + '.post_undelete', function post_undelete(data) {
    let postId = data.$this.data('post-id');

    return N.io.rpc('forum.topic.post.undelete', { post_id: postId }).then(() => {
      $('#post' + postId)
        .removeClass('forum-post__m-deleted')
        .removeClass('forum-post__m-deleted-hard');
    });
  });


  // Subscription topic handler
  //
  N.wire.on(module.apiPath + ':subscription', function topic_subscription(data) {
    let hid = data.$this.data('topic-hid');
    let params = { subscription: data.$this.data('topic-subscription') };
    let pageParams = {};

    return Promise.resolve()
      .then(() => N.wire.emit('forum.topic.topic_subscription', params))
      .then(() => N.io.rpc('forum.topic.subscribe', { topic_hid: hid, type: params.subscription }))
      .then(() => N.wire.emit('navigate.get_page_raw', pageParams))
      .then(() => {
        pageParams.data.subscription = params.subscription;
      })
      .then(updateTopicState);
  });


  // Delete topic handler
  //
  N.wire.on(module.apiPath + '.topic_delete', function topic_delete(data) {
    let request = {
      topic_hid: data.$this.data('topic-hid'),
      as_moderator: data.$this.data('as-moderator') || false
    };
    let params = {
      canDeleteHard: N.runtime.page_data.settings.forum_mod_can_hard_delete_topics,
      asModerator: request.as_moderator
    };

    return Promise.resolve()
      .then(() => N.wire.emit('forum.topic.topic_delete_dlg', params))
      .then(() => {
        request.method = params.method;
        if (params.reason) request.reason = params.reason;
        return N.io.rpc('forum.topic.destroy', request);
      })
      .then(() =>
        N.wire.emit('navigate.to', { apiPath: 'forum.section', params: { section_hid: topicState.section_hid } })
      );
  });


  // Delete post handler
  //
  N.wire.on(module.apiPath + '.post_delete', function post_delete(data) {
    let postId = data.$this.data('post-id');
    let $post = $('#post' + postId);
    let request = {
      post_id: postId,
      as_moderator: data.$this.data('as-moderator') || false
    };
    let params = {
      asModerator: request.as_moderator,
      canDeleteHard: N.runtime.page_data.settings.forum_mod_can_hard_delete_topics
    };

    return Promise.resolve()
      .then(() => N.wire.emit('forum.topic.post_delete_dlg', params))
      .then(() => {
        request.method = params.method;
        if (params.reason) request.reason = params.reason;
        return N.io.rpc('forum.topic.post.destroy', request);
      })
      .then(() => N.io.rpc('forum.topic.list.by_ids', { topic_hid: topicState.topic_hid, posts_ids: [ postId ] }))
      .then(res => {
        if (res.posts.length === 0) {
          $post.fadeOut(function () {
            $post.remove();
          });
          return;
        }

        let $result = $(N.runtime.render('forum.blocks.posts_list', res));

        return N.wire.emit('navigate.update', { $: $result, locals: res }).then(() => $post.replaceWith($result));
      });
  });


  // Add/remove bookmark
  //
  N.wire.on(module.apiPath + '.post_bookmark', function post_bookmark(data) {
    let postId = data.$this.data('post-id');
    let remove = data.$this.data('remove') || false;
    let $post = $('#post' + postId);

    return N.io.rpc('forum.topic.post.bookmark', { post_id: postId, remove }).then(res => {
      if (remove) {
        $post.removeClass('forum-post__m-bookmarked');
      } else {
        $post.addClass('forum-post__m-bookmarked');
      }

      $post.find('.forum-post__bookmarks-count').attr('data-bm-count', res.count);
    });
  });


  ///////////////////////////////////////////////////////////////////////////
  // Whenever we are close to beginning/end of post list, check if we can
  // load more pages from the server
  //

  // an amount of posts we try to load when user scrolls to the end of the page
  let LOAD_POSTS_COUNT = N.runtime.page_data.pagination.per_page;

  // an amount of time between successful xhr requests and failed xhr requests respectively
  //
  // For example, suppose user continuously scrolls. If server is up, each
  // subsequent request will be sent each 500 ms. If server goes down, the
  // interval between request initiations goes up to 2000 ms.
  //
  let LOAD_INTERVAL = 500;
  let LOAD_AFTER_ERROR = 2000;

  // an amount of posts from top/bottom that triggers prefetch in that direction
  let LOAD_BORDER_SIZE = 3;

  function _load_prev_page() {
    let now = Date.now();

    // `prev_loading_start` is the last request start time, which is reset to 0 on success
    //
    // Thus, successful requests can restart immediately, but failed ones
    // will have to wait `LOAD_AFTER_ERROR` ms.
    //
    if (Math.abs(topicState.prev_loading_start - now) < LOAD_AFTER_ERROR) { return; }

    topicState.prev_loading_start = now;

    let hid = $('.forum-post:first').data('post-hid');

    // No posts on the page
    if (!hid) return;

    // If the first post on the page is hid=1, it's a first page,
    // so we don't need to load anything
    //
    // This is sufficient because post with hid=1 always exists.
    //
    if (hid <= 1) return;

    N.io.rpc('forum.topic.list.by_range', {
      topic_hid: topicState.topic_hid,
      post_hid:  hid - 1,
      before:    LOAD_POSTS_COUNT,
      after:     0
    }).then(res => {
      topicState.post_count = res.topic.cache.post_count;

      if (res.max_post && res.max_post !== topicState.max_post) {
        topicState.max_post = res.max_post;

        N.wire.emit('forum.topic.blocks.page_progress:update', {
          max: topicState.max_post
        });
      }

      if (!res.posts || !res.posts.length) return;

      let old_height = $('.forum-postlist').height();

      topicState.first_post_offset -= res.posts.length;

      res.pagination = {
        // used in paginator
        total:        topicState.post_count,
        per_page:     N.runtime.page_data.pagination.per_page,
        chunk_offset: topicState.first_post_offset
      };

      // render & inject posts list
      let $result = $(N.runtime.render('forum.blocks.posts_list', res));

      return N.wire.emit('navigate.update', { $: $result, locals: res }).then(() => {
        $('.forum-postlist > :first').before($result);

        // update scroll so it would point at the same spot as before
        $(window).scrollTop($(window).scrollTop() + $('.forum-postlist').height() - old_height);

        // Update selection state
        _.intersection(topicState.selected_posts, _.map(res.posts, '_id')).forEach(postId => {
          $(`#post${postId}`)
            .addClass('forum-post__m-selected')
            .find('.forum-post__check')
            .prop('checked', true);
        });

        topicState.prev_loading_start = 0;
      });

    }).catch(err => {
      if (err.code !== N.io.NOT_FOUND) {
        N.wire.emit('error', err);
        return;
      }

      // Topic moved or deleted, refreshing the page so user could
      // see the error
      //
      N.wire.emit('navigate.reload');
    });
  }

  function _load_next_page() {
    let now = Date.now();

    // `next_loading_start` is the last request start time, which is reset to 0 on success
    //
    // Thus, successful requests can restart immediately, but failed ones
    // will have to wait `LOAD_AFTER_ERROR` ms.
    //
    if (Math.abs(topicState.next_loading_start - now) < LOAD_AFTER_ERROR) { return; }

    topicState.next_loading_start = now;

    let hid = $('.forum-post:last').data('post-hid');

    // No posts on the page
    if (!hid) return;

    // If the last post on the page is visible, no need to scroll further.
    //
    if (hid >= topicState.max_post) return;

    N.io.rpc('forum.topic.list.by_range', {
      topic_hid: topicState.topic_hid,
      post_hid:  hid + 1,
      before:    0,
      after:     LOAD_POSTS_COUNT
    }).then(res => {
      topicState.post_count = res.topic.cache.post_count;

      if (res.max_post && res.max_post !== topicState.max_post) {
        topicState.max_post = res.max_post;

        N.wire.emit('forum.topic.blocks.page_progress:update', {
          max: topicState.max_post
        });
      }

      if (!res.posts || !res.posts.length) return;

      res.pagination = {
        // used in paginator
        total:        topicState.post_count,
        per_page:     N.runtime.page_data.pagination.per_page,
        chunk_offset: topicState.last_post_offset + 1
      };

      topicState.last_post_offset += res.posts.length;

      // render & inject posts list
      let $result = $(N.runtime.render('forum.blocks.posts_list', res));

      return N.wire.emit('navigate.update', { $: $result, locals: res }).then(() => {
        $('.forum-postlist > :last').after($result);

        // Update selection state
        _.intersection(topicState.selected_posts, _.map(res.posts, '_id')).forEach(postId => {
          $(`#post${postId}`)
            .addClass('forum-post__m-selected')
            .find('.forum-post__check')
            .prop('checked', true);
        });

        topicState.next_loading_start = 0;
      });

    }).catch(err => {
      if (err.code !== N.io.NOT_FOUND) {
        N.wire.emit('error', err);
        return;
      }

      // Topic moved or deleted, refreshing the page so user could
      // see the error
      //
      N.wire.emit('navigate.reload');
    });
  }

  let load_prev_page = _.debounce(_load_prev_page, LOAD_INTERVAL, { leading: true, maxWait: LOAD_INTERVAL });
  let load_next_page = _.debounce(_load_next_page, LOAD_INTERVAL, { leading: true, maxWait: LOAD_INTERVAL });

  // If we're browsing one of the first/last 3 posts, load more pages from
  // the server in that direction.
  //
  // This method is synchronous, so rpc requests won't delay progress bar
  // updates.
  //
  N.wire.on(module.apiPath + ':scroll', function check_load_more_pages() {
    let posts         = $('.forum-post'),
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
  N.wire.on(module.apiPath + ':scroll', function update_progress() {
    let posts         = $('.forum-post'),
        viewportStart = $(window).scrollTop() + navbarHeight,
        newHid,
        currentIdx;

    // Get offset of the first post in the viewport
    //
    currentIdx = _.sortedIndexBy(posts, null, post => {
      if (!post) return viewportStart;
      return $(post).offset().top + $(post).height();
    });

    if (currentIdx >= posts.length) { currentIdx = posts.length - 1; }

    newHid = $(posts[currentIdx]).data('post-hid');
    if (newHid === topicState.post_hid) return;

    topicState.post_hid = newHid;

    return N.wire.emit('navigate.replace', {
      href: N.router.linkTo('forum.topic', {
        section_hid:  topicState.section_hid,
        topic_hid:    topicState.topic_hid,
        post_hid:     topicState.post_hid
      })
    }).then(() => N.wire.emit('forum.topic.blocks.page_progress:update', {
      current: topicState.post_hid,
      max:     topicState.max_post
    }));
  });


  // User clicks submits dropdown menu form and is moved to
  // a corresponding post
  //
  N.wire.on(module.apiPath + ':nav_to_post', function navigate_to_post(data) {
    let post = +data.fields.post;

    if (!post) return;

    return N.wire.emit('navigate.to', {
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
  N.wire.on(module.apiPath + ':nav_to_start', function navigate_to_start() {
    let hid = $('.forum-post:first').data('post-hid');

    // if the first post is already loaded, scroll to the top
    if (hid <= 1) {
      $(window).scrollTop(0);
      return;
    }

    return N.wire.emit('navigate.to', {
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
  N.wire.on(module.apiPath + ':nav_to_end', function navigate_to_end() {
    let hid = $('.forum-post:last').data('post-hid');

    // if the last post is already loaded, scroll to the bottom
    if (hid >= topicState.max_post) {
      $(window).scrollTop($('.forum-post:last').offset().top - navbarHeight);
      return;
    }

    // Note: this will scroll to the last post, not to the real bottom like
    // browsers do. There is a difference if footer is large enough.
    //
    return N.wire.emit('navigate.to', {
      apiPath: 'forum.topic',
      params: {
        section_hid:  topicState.section_hid,
        topic_hid:    topicState.topic_hid,
        post_hid:     topicState.max_post
      }
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

  let viewportStart = $(window).scrollTop() + navbarHeight;

  // If we scroll below top border of the first post,
  // show the secondary navbar
  //
  if ($('.forum-postlist').offset().top < viewportStart) {
    $('.navbar').addClass('navbar__m-secondary');
  } else {
    $('.navbar').removeClass('navbar__m-secondary');
  }

  return N.wire.emit('forum.topic:scroll');
});

N.wire.on('navigate.exit:' + module.apiPath, function navbar_teardown() {
  $('.navbar-alt').empty();
  $('.navbar').removeClass('navbar__m-secondary');
});


///////////////////////////////////////////////////////////////////////////////
// Set a "same page" modifier to all block quotes which point to the same topic
//

// current topic params if we're on the topic page, null otherwise;
let topicParams;


// Set `quote__m-local` or `quote__m-outer` class on every quote
// depending on whether its origin is in the same topic or not.
//
function set_quote_modifiers(selector) {
  // if topicParams is not set, it means we aren't on a topic page
  if (!topicParams) return;

  selector.find('.quote').addBack('.quote').each(function () {
    let $tag = $(this);

    if ($tag.hasClass('quote__m-local') || $tag.hasClass('quote__m-outer')) {
      return;
    }

    let cite = $tag.attr('cite');

    if (!cite) return;

    let match = N.router.match(cite);

    if (!match) return;

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
const bag = require('bagjs')({ prefix: 'nodeca' });
let scrollPositionTracker = null;


const uploadScrollPositions = _.debounce(function () {
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
  if (N.runtime.is_guest) return;

  let lastPos = -1;
  let lastRead = -1;

  scrollPositionTracker = _.debounce(function () {
    let $window = $(window);
    let viewportStart = $window.scrollTop() + navbarHeight;
    let viewportEnd = $window.scrollTop() + $window.height();
    let $posts = $('.forum-post');

    let currentIdx = _.sortedIndexBy($posts, null, post => {
      if (!post) return viewportStart;
      return $(post).offset().top + $(post).height();
    });

    if (currentIdx >= $posts.length) {
      currentIdx = $posts.length - 1;
    }

    let lastVisibleIdx = $posts.length - 1;

    // Search last completely visible post
    for (let i = currentIdx + 1; i < $posts.length; i++) {
      if ($($posts[i]).offset().top + $($posts[i]).height() > viewportEnd) {
        lastVisibleIdx = i - 1;
        break;
      }
    }

    // No posts on the page
    if (lastVisibleIdx < 0) return;

    // Last completely visible post on page to mark it as read
    let read = $($posts[lastVisibleIdx]).data('post-hid');
    // Current scroll (topic hid) position
    let pos;

    let $post = $($posts[currentIdx]);

    // If first post in viewport hidden more than half height and second post is
    // completely visible - set `pos` to second post hid
    if ($post.offset().top + $post.height() / 2 < viewportStart && lastVisibleIdx > currentIdx) {
      pos = $($posts[currentIdx + 1]).data('post-hid');
    } else {
      pos = $post.data('post-hid');
    }

    if (lastPos === pos && lastRead === read) return;

    lastPos = pos;
    lastRead = read;

    // Save current position locally and request upload
    bag.get('topics_scroll', function (__, positions) {
      positions = positions || {};
      positions[N.runtime.page_data.topic._id] = {
        pos,
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


///////////////////////////////////////////////////////////////////////////////
// Multi posts selection
//


// Flag shift key pressed
let shift_key_pressed = false;
// DOM element of first selected post (for multi check)
let $multi_select_start;


// Handle shift keyup event
//
function key_up(event) {
  // If shift still pressed
  if (event.shiftKey) return;

  shift_key_pressed = false;
}


// Handle shift keydown event
//
function key_down(event) {
  if (event.shiftKey) {
    shift_key_pressed = true;
  }
}


// Save selected posts debounced
//
const save_selected_posts = _.debounce(() => {
  let key = 'topic_selected_posts_' + topicState.topic_hid;

  if (topicState.selected_posts.length) {
    // Expire after 1 day
    bag.set(key, topicState.selected_posts, 60 * 60 * 24);
  } else {
    bag.remove(key);
  }
}, 500);


// Load previously selected posts
//
N.wire.on('navigate.done:' + module.apiPath, function topic_load_previously_selected_posts() {
  $(document)
    .on('keyup', key_up)
    .on('keydown', key_down);

  return bag.get('topic_selected_posts_' + topicState.topic_hid)
    .then(ids => {
      topicState.selected_posts = ids || [];
      topicState.selected_posts.forEach(postId => {
        $(`#post${postId}`)
          .addClass('forum-post__m-selected')
          .find('.forum-post__check')
          .prop('checked', true);
      });
    })
    .then(updateTopicState);
});


// Init handlers
//
N.wire.once('navigate.done:' + module.apiPath, function topic_post_selection_init() {

  // Update array of selected posts on selection change
  //
  N.wire.on('forum.topic:post_check', function topic_post_select(data) {
    let postId = data.$this.data('post-id');

    if (data.$this.is(':checked') && topicState.selected_posts.indexOf(postId) === -1) {
      // Select
      //
      if ($multi_select_start) {

        // If multi select started
        //
        let $post = data.$this.closest('.forum-post');
        let $start = $multi_select_start;
        let postsBetween;

        $multi_select_start = null;

        // If current after `$multi_select_start`
        if ($start.index() < $post.index()) {
          // Get posts between start and current
          postsBetween = $start.nextUntil($post, '.forum-post');
        } else {
          // Between current and start (in reverse order)
          postsBetween = $post.nextUntil($start, '.forum-post');
        }

        postsBetween.each(function () {
          let id = $(this).data('post-id');

          if (topicState.selected_posts.indexOf(id) === -1) {
            topicState.selected_posts.push(id);
          }

          $(this).find('.forum-post__check').prop('checked', true);
          $(this).addClass('forum-post__m-selected');
        });

        topicState.selected_posts.push(postId);
        $post.addClass('forum-post__m-selected');


      } else if (shift_key_pressed) {
        // If multi select not started and shift key pressed
        //
        let $post = data.$this.closest('.forum-post');

        $multi_select_start = $post;
        $post.addClass('forum-post__m-selected');
        topicState.selected_posts.push(postId);

        N.wire.emit('notify', { type: 'info', message: t('msg_multiselect') });


      } else {
        // No multi select
        //
        data.$this.closest('.forum-post').addClass('forum-post__m-selected');
        topicState.selected_posts.push(postId);
      }


    } else if (!data.$this.is(':checked') && topicState.selected_posts.indexOf(postId) !== -1) {
      // Unselect
      //
      data.$this.closest('.forum-post').removeClass('forum-post__m-selected');
      topicState.selected_posts = _.without(topicState.selected_posts, postId);
    }

    save_selected_posts();
    return updateTopicState();
  });


  // Unselect all posts
  //
  N.wire.on('forum.topic:posts_unselect', function topic_posts_unselect() {
    topicState.selected_posts = [];

    $('.forum-post__check:checked').each(function () {
      $(this)
        .prop('checked', false)
        .closest('.forum-post')
        .removeClass('forum-post__m-selected');
    });

    save_selected_posts();
    return updateTopicState();
  });
});


// Teardown multi post selection
//
N.wire.on('navigate.exit:' + module.apiPath, function topic_post_selection_teardown() {
  $(document)
    .off('keyup', key_up)
    .off('keydown', key_down);
});
