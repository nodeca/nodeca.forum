// Forum Topic page logic
//
'use strict';


const _             = require('lodash');
const charcount     = require('charcount');
const topicStatuses = '$$ JSON.stringify(N.models.forum.Topic.statuses) $$';
const bag           = require('bagjs')({ prefix: 'nodeca' });


// Topic state
//
// - section_hid:        current section hid
// - topic_hid:          current topic hid
// - post_hid:           current post hid
// - max_post:           hid of the last post in this topic
// - post_count:         an amount of visible posts in the topic
// - posts_per_page:     an amount of visible posts per page
// - topic_last_ts:      last post creation time (used for edit confirmation)
// - first_post_offset:  total amount of visible posts in the topic before the first displayed post
// - last_post_offset:   total amount of visible posts in the topic before the last displayed post
// - prev_loading_start: time when current xhr request for the previous page is started
// - next_loading_start: time when current xhr request for the next page is started
// - top_marker:         hid of the top post (for prefetch)
// - bottom_marker:      hid of the bottom post (for prefetch)
// - selected_posts:     array of selected posts in current topic
//
let topicState = {};

let $window = $(window);

let navbarHeight = $('.navbar').height();

// height of a space between text content of a post and the next post header
const TOP_OFFSET = 50;

// whenever there are more than 600 posts, cut off-screen posts down to 400
const CUT_ITEMS_MAX = 600;
const CUT_ITEMS_MIN = 400;


/////////////////////////////////////////////////////////////////////
// init on page load and destroy editor on window unload
//
N.wire.on('navigate.done:' + module.apiPath, function page_setup(data) {
  topicState.section            = N.runtime.page_data.section;
  topicState.topic_hid          = data.params.topic_hid;
  topicState.post_hid           = data.params.post_hid || 1;
  topicState.post_count         = N.runtime.page_data.pagination.total;
  topicState.posts_per_page     = N.runtime.page_data.pagination.per_page;
  topicState.max_post           = N.runtime.page_data.topic.cache.last_post_hid;
  topicState.topic_last_ts      = N.runtime.page_data.topic.cache.last_ts;
  topicState.first_post_offset  = N.runtime.page_data.pagination.chunk_offset;
  topicState.last_post_offset   = N.runtime.page_data.pagination.chunk_offset + $('.forum-post').length - 1;
  topicState.top_marker         = $('.forum-topic-root').data('top-marker');
  topicState.bottom_marker      = $('.forum-topic-root').data('bottom-marker');
  topicState.prev_loading_start = 0;
  topicState.next_loading_start = 0;
  topicState.selected_posts     = [];

  // disable automatic scroll to an anchor in the navigator
  data.no_scroll = true;


  // If user moves to a page (e.g. from a search engine),
  // we should scroll him to the top post on that page
  //
  if (data.params.page && data.params.page > 1) {
    topicState.post_hid = $('.forum-post:first').data('post-hid');
  }


  // Scroll to a post linked in params (if any)
  //
  if (data.state && typeof data.state.hid !== 'undefined' && typeof data.state.offset !== 'undefined') {
    let posts = $('.forum-post');
    let i = _.sortedIndexBy(posts, null, post => {
      if (!post) return data.state.hid;
      return $(post).data('post-hid');
    });

    // `i` is the index of a post with given hid if it exists,
    // otherwise it's a position of the first post with hid more than that
    //
    if (i >= posts.length) { i = posts.length - 1; }
    $window.scrollTop($(posts[i]).offset().top - navbarHeight - TOP_OFFSET + data.state.offset);

  } else if (topicState.post_hid > 1) {
    let posts = $('.forum-post');
    let i = _.sortedIndexBy(posts, null, post => {
      if (!post) return topicState.post_hid;
      return $(post).data('post-hid');
    });

    // `i` is the index of a post with given hid if it exists,
    // otherwise it's a position of the first post with hid more than that
    //
    if (i >= posts.length) { i = posts.length - 1; }
    $window.scrollTop($(posts[i]).offset().top - navbarHeight - TOP_OFFSET);

  } else {
    // If user clicks on a link to the first post of the topic,
    // we should scroll to the top.
    //
    $window.scrollTop(0);
  }
});


/////////////////////////////////////////////////////////////////////
// When user scrolls the page:
//
//  1. update progress bar
//  2. show/hide navbar
//
let progressScrollHandler = null;

N.wire.on('navigate.done:' + module.apiPath, function progress_updater_init() {
  progressScrollHandler = _.debounce(function update_progress_on_scroll() {
    let viewportStart = $window.scrollTop() + navbarHeight;

    // If we scroll below top border of the first post,
    // show the secondary navbar
    //
    if ($('.forum-postlist').offset().top < viewportStart) {
      $('.navbar').addClass('navbar__m-secondary');
    } else {
      $('.navbar').removeClass('navbar__m-secondary');
    }

    //
    // Update location and progress bar
    //
    let posts         = document.getElementsByClassName('forum-post'),
        postThreshold = $window.scrollTop() + navbarHeight + TOP_OFFSET,
        currentIdx;

    // Get offset of the first post in the viewport
    //
    currentIdx = _.sortedIndexBy(posts, null, post => {
      if (!post) return postThreshold;
      return post.offsetTop + $(post).height();
    });

    if (currentIdx >= posts.length) { currentIdx = posts.length - 1; }

    N.wire.emit('forum.topic.blocks.page_progress:update', {
      current: $(posts[currentIdx]).data('post-hid'),
      max:     topicState.max_post
    }).catch(err => {
      N.wire.emit('error', err);
    });
  }, 100, { maxWait: 100 });

  // avoid executing it on first tick because of initial scrollTop()
  setTimeout(function () {
    $window.on('scroll', progressScrollHandler);
  }, 1);


  // execute it once on page load
  progressScrollHandler();
});

N.wire.on('navigate.exit:' + module.apiPath, function scroll_tracker_teardown() {
  progressScrollHandler.cancel();
  $window.off('scroll', progressScrollHandler);
  progressScrollHandler = null;
});


/////////////////////////////////////////////////////////////////////
// Change URL when user scrolls the page
//
// Use a separate debouncer that only fires when user stops scrolling,
// so it's executed a lot less frequently.
//
// The reason is that `history.replaceState` is very slow in FF
// on large pages: https://bugzilla.mozilla.org/show_bug.cgi?id=1250972
//
let locationScrollHandler = null;

N.wire.on('navigate.done:' + module.apiPath, function location_updater_init() {
  locationScrollHandler = _.debounce(function update_location_on_scroll() {
    let posts         = document.getElementsByClassName('forum-post'),
        postThreshold = $window.scrollTop() + navbarHeight + TOP_OFFSET,
        newHid,
        currentIdx;

    // Get offset of the first post in the viewport
    //
    currentIdx = _.sortedIndexBy(posts, null, post => {
      if (!post) return postThreshold;
      return post.offsetTop + $(post).height();
    });

    if (currentIdx >= posts.length) { currentIdx = posts.length - 1; }

    newHid = $(posts[currentIdx]).data('post-hid');

    let href = null;
    let state = {
      hid:    newHid,
      offset: postThreshold - posts[currentIdx].offsetTop
    };

    // save current hid to topicState, and only update url if hid is different,
    // it protects url like /f1/topic23/page4 from being overwritten instantly
    if (topicState.post_hid !== newHid) {
      topicState.post_hid = newHid;

      href = N.router.linkTo('forum.topic', {
        section_hid:  topicState.section.hid,
        topic_hid:    topicState.topic_hid,
        post_hid:     topicState.post_hid
      });
    }

    N.wire.emit('navigate.replace', { href, state })
          .catch(err => N.wire.emit('error', err));

  }, 500);

  // avoid executing it on first tick because of initial scrollTop()
  setTimeout(function () {
    $window.on('scroll', locationScrollHandler);
  }, 1);
});

N.wire.on('navigate.exit:' + module.apiPath, function scroll_tracker_teardown() {
  locationScrollHandler.cancel();
  $window.off('scroll', locationScrollHandler);
  locationScrollHandler = null;
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


// Delete topic
//
function delete_topic(as_moderator) {
  let request = {
    topic_hid: topicState.topic_hid,
    as_moderator: as_moderator || false
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
      N.wire.emit('navigate.to', { apiPath: 'forum.section', params: { section_hid: topicState.section.hid } })
    );
}


N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  // Display confirmation when answering in an inactive topic
  //
  N.wire.before(module.apiPath + ':reply', function old_reply_confirm(data) {
    let topic_inactive_for_days = Math.floor((Date.now() - new Date(topicState.topic_last_ts)) / (24 * 60 * 60 * 1000));

    if (topic_inactive_for_days >= N.runtime.page_data.settings.forum_reply_old_post_threshold) {
      return N.wire.emit('common.blocks.confirm', {
        html: t('old_topic_reply_confirm', { count: topic_inactive_for_days })
      });
    }

    if (data.$this.data('post-id')) {
      let post_time = new Date(data.$this.data('post-ts')).getTime();
      let post_older_than_days = Math.floor((Date.now() - post_time) / (24 * 60 * 60 * 1000));

      if (post_older_than_days >= N.runtime.page_data.settings.forum_reply_old_post_threshold) {
        return N.wire.emit('common.blocks.confirm', {
          html: t('old_post_reply_confirm', { count: post_older_than_days })
        });
      }
    }
  });

  // Click on post reply link or toolbar reply button
  //
  N.wire.on(module.apiPath + ':reply', function reply(data) {
    return N.wire.emit('forum.topic.reply:begin', {
      topic_hid: topicState.topic_hid,
      topic_title: N.runtime.page_data.topic.title,
      section_hid: topicState.section.hid,
      post_id: data.$this.data('post-id'),
      post_hid: data.$this.data('post-hid')
    });
  });


  // Click report button
  //
  N.wire.on(module.apiPath + ':report', function report(data) {
    let params = { messages: t('@forum.abuse_report.messages') };
    let postId = data.$this.data('post-id');

    return Promise.resolve()
      .then(() => N.wire.emit('common.blocks.abuse_report_dlg', params))
      .then(() => N.io.rpc('forum.topic.post.abuse_report', { post_id: postId, message: params.message }))
      .then(() => N.wire.emit('notify', { type: 'info', message: t('abuse_reported') }));
  });


  // Click on post edit
  //
  N.wire.on(module.apiPath + ':post_edit', function reply(data) {
    return N.wire.emit('forum.topic.post.edit:begin', {
      topic_hid: topicState.topic_hid,
      topic_title: N.runtime.page_data.topic.title,
      section_hid: topicState.section.hid,
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


  // Add infraction
  //
  N.wire.on(module.apiPath + ':add_infraction', function add_infraction(data) {
    let postId = data.$this.data('post-id');
    let params = { post_id: postId };

    return Promise.resolve()
      .then(() => N.wire.emit('users.blocks.add_infraction_dlg', params))
      .then(() => N.io.rpc('forum.topic.post.add_infraction', params))
      .then(() => N.io.rpc('forum.topic.list.by_ids', { topic_hid: topicState.topic_hid, posts_ids: [ postId ] }))
      .then(res => {
        let $result = $(N.runtime.render('forum.blocks.posts_list', res));

        return N.wire.emit('navigate.update', { $: $result, locals: res })
          .then(() => $(`#post${postId}`).replaceWith($result));
      })
      .then(() => N.wire.emit('notify', { type: 'info', message: t('infraction_added') }));
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
          .then(() => {
            $('#post' + postId).replaceWith($result);

            if (topicState.selected_posts.indexOf(postId) !== -1) {
              $result
                .addClass('forum-post__m-selected')
                .find('.forum-post__select-cb').prop('checked', true);
            }
          });
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


  // Move topic
  //
  N.wire.on(module.apiPath + ':move', function topic_move(data) {
    let topicHid = data.$this.data('topic-hid');
    let params = { section_hid_from: topicState.section.hid };

    return Promise.resolve()
      .then(() => N.wire.emit('forum.topic.topic_move_dlg', params))
      .then(() => {
        let request = {
          section_hid_from: params.section_hid_from,
          section_hid_to: params.section_hid_to,
          topic_hid: topicHid
        };

        return N.io.rpc('forum.topic.move', request);
      })
      .then(() => N.wire.emit('notify', { type: 'info', message: t('move_topic_done') }))
      .then(() => N.wire.emit('navigate.reload'));
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

        if (charcount(value) < forum_topic_title_min_length) {
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
    return delete_topic(data.$this.data('as-moderator'));
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


  // User presses "home" button
  //
  N.wire.on(module.apiPath + ':nav_to_start', function navigate_to_start() {
    let hid = topicState.top_marker;

    // if the first post is already loaded, scroll to the top
    if (!hid || hid <= 1) {
      $window.scrollTop(0);
      return;
    }

    return N.wire.emit('navigate.to', {
      apiPath: 'forum.topic',
      params: {
        section_hid:  topicState.section.hid,
        topic_hid:    topicState.topic_hid,
        post_hid:     1
      }
    });
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
        section_hid:  topicState.section.hid,
        topic_hid:    topicState.topic_hid,
        post_hid:     post
      }
    });
  });


  // User presses "end" button
  //
  N.wire.on(module.apiPath + ':nav_to_end', function navigate_to_end() {
    let hid = topicState.bottom_marker;

    // if the last post is already loaded, scroll to the bottom
    if (!hid || hid >= topicState.max_post) {
      $window.scrollTop($('.forum-post:last').offset().top - navbarHeight);
      return;
    }

    // Note: this will scroll to the last post, not to the real bottom like
    // browsers do. There is a difference if footer is large enough.
    //
    return N.wire.emit('navigate.to', {
      apiPath: 'forum.topic',
      params: {
        section_hid:  topicState.section.hid,
        topic_hid:    topicState.topic_hid,
        post_hid:     topicState.max_post
      }
    });
  });


  ///////////////////////////////////////////////////////////////////////////
  // Whenever we are close to beginning/end of post list, check if we can
  // load more pages from the server
  //

  // an amount of posts we try to load when user scrolls to the end of the page
  const LOAD_POSTS_COUNT = N.runtime.page_data.pagination.per_page;

  // A delay after failed xhr request (delay between successful requests
  // is set with affix `throttle` argument)
  //
  // For example, suppose user continuously scrolls. If server is up, each
  // subsequent request will be sent each 100 ms. If server goes down, the
  // interval between request initiations goes up to 2000 ms.
  //
  const LOAD_AFTER_ERROR = 2000;

  N.wire.on(module.apiPath + ':load_prev', function load_prev_page() {
    let now = Date.now();

    // `prev_loading_start` is the last request start time, which is reset to 0 on success
    //
    // Thus, successful requests can restart immediately, but failed ones
    // will have to wait `LOAD_AFTER_ERROR` ms.
    //
    if (Math.abs(topicState.prev_loading_start - now) < LOAD_AFTER_ERROR) return;

    topicState.prev_loading_start = now;

    let hid = topicState.top_marker;

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
      post_hid:  hid,
      before:    LOAD_POSTS_COUNT,
      after:     0
    }).then(res => {
      topicState.post_count = res.topic.cache.post_count;
      topicState.topic_last_ts = res.topic.cache.last_ts;

      if (res.topic.cache.last_post_hid !== topicState.max_post) {
        topicState.max_post = res.topic.cache.last_post_hid;

        N.wire.emit('forum.topic.blocks.page_progress:update', {
          max: topicState.max_post
        });
      }

      if (!res.posts || !res.posts.length) return;

      topicState.first_post_offset -= res.posts.length - 1;

      res.pagination = {
        // used in paginator
        total:        topicState.post_count,
        per_page:     N.runtime.page_data.pagination.per_page,
        chunk_offset: topicState.first_post_offset
      };

      // render & inject posts list
      let $result = $(N.runtime.render('forum.blocks.posts_list', res));

      // Cut duplicate post, used to display date intervals properly,
      // here's an example showing how it works:
      //
      //   DOM                + fetched          = result
      // | ...           |                     | ...           |
      // +---------------+                     +---------------+
      // | post#37       |                     | post#37       |
      // +---------------+                     +---------------+
      // | paginator     |                     | paginator     |
      // | interval      |                     | interval      |
      // | etc.          |                     | etc.          |
      // +---------------+  +---------------+  +---------------+
      // | post#38       |  | post#38 (cut) |  | post#38       |
      // +---------------+  +---------------+  +---------------+
      //                    | paginator     |  | paginator     |
      //                    | interval      |  | interval      |
      //                    | etc.          |  | etc.          |
      //                    +---------------+  +---------------+
      //                    | post#39       |  | post#39       |
      //                    +---------------+  +---------------+
      //                    | ...           |  | ...           |
      //
      // Reason for this: we don't have the data to display post intervals
      //                  for the first post in the DOM.
      //
      let idx = $result.index($result.filter('#' + $('.forum-post:first').attr('id')));

      if (idx !== -1) $result = $result.slice(0, idx);

      return N.wire.emit('navigate.update', { $: $result, locals: res }).then(() => {
        let old_height = $('.forum-postlist').height();
        let old_scroll = $window.scrollTop();

        $('.forum-postlist > :first').before($result);

        // update scroll so it would point at the same spot as before
        $window.scrollTop(old_scroll + $('.forum-postlist').height() - old_height);

        // Update selection state
        _.intersection(topicState.selected_posts, _.map(res.posts, '_id')).forEach(postId => {
          $(`#post${postId}`)
            .addClass('forum-post__m-selected')
            .find('.forum-post__select-cb')
            .prop('checked', true);
        });

        //
        // Limit total amount of posts in DOM
        //
        let posts     = document.getElementsByClassName('forum-post');
        let cut_count = posts.length - CUT_ITEMS_MIN;

        if (cut_count > CUT_ITEMS_MAX - CUT_ITEMS_MIN) {
          let post = posts[posts.length - cut_count - 1];

          // This condition is a safeguard to prevent infinite loop,
          // which happens if we remove a post on the screen and trigger
          // prefetch in the opposite direction (test it with
          // CUT_ITEMS_MAX=10, CUT_ITEMS_MIN=0)
          if (post.getBoundingClientRect().top > $window.height() + 600) {
            let old_length = posts.length;

            $(post).nextAll().remove();

            topicState.bottom_marker = $('.forum-post:last').data('post-hid');

            topicState.last_post_offset -= old_length - document.getElementsByClassName('forum-post').length;
          }
        }

        // reset lock
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
  });

  N.wire.on(module.apiPath + ':load_next', function load_next_page() {
    let now = Date.now();

    // `next_loading_start` is the last request start time, which is reset to 0 on success
    //
    // Thus, successful requests can restart immediately, but failed ones
    // will have to wait `LOAD_AFTER_ERROR` ms.
    //
    if (Math.abs(topicState.next_loading_start - now) < LOAD_AFTER_ERROR) return;

    topicState.next_loading_start = now;

    let hid = topicState.bottom_marker;

    // No posts on the page
    if (!hid) return;

    // If the last post on the page is visible, no need to scroll further.
    //
    if (hid >= topicState.max_post) return;

    N.io.rpc('forum.topic.list.by_range', {
      topic_hid: topicState.topic_hid,
      post_hid:  hid,
      before:    0,
      after:     LOAD_POSTS_COUNT
    }).then(res => {
      topicState.post_count = res.topic.cache.post_count;
      topicState.topic_last_ts = res.topic.cache.last_ts;

      if (res.topic.cache.last_post_hid !== topicState.max_post) {
        topicState.max_post = res.topic.cache.last_post_hid;

        N.wire.emit('forum.topic.blocks.page_progress:update', {
          max: topicState.max_post
        });
      }

      if (!res.posts || !res.posts.length) return;

      res.pagination = {
        // used in paginator
        total:        topicState.post_count,
        per_page:     N.runtime.page_data.pagination.per_page,
        chunk_offset: topicState.last_post_offset
      };

      topicState.last_post_offset += res.posts.length - 1;

      // render & inject posts list
      let $result = $(N.runtime.render('forum.blocks.posts_list', res));

      // Cut duplicate post, used to display date intervals properly,
      // here's an example showing how it works:
      //
      //   DOM                + fetched          = result
      // | ...           |                     | ...           |
      // +---------------+                     +---------------+
      // | post#37       |                     | post#37       |
      // +---------------+                     +---------------+
      // | paginator     |                     | paginator     |
      // | interval      |                     | interval      |
      // | etc.          |                     | etc.          |
      // +---------------+  +---------------+  +---------------+
      // | post#38       |  | post#38 (cut) |  | post#38       |
      // +---------------+  +---------------+  +---------------+
      //                    | paginator     |  | paginator     |
      //                    | interval      |  | interval      |
      //                    | etc.          |  | etc.          |
      //                    +---------------+  +---------------+
      //                    | post#39       |  | post#39       |
      //                    +---------------+  +---------------+
      //                    | ...           |  | ...           |
      //
      // Reason for this: we don't have the data to display post intervals
      //                  for the first post in the DOM.
      //
      let idx = $result.index($result.filter('#' + $('.forum-post:last').attr('id')));

      if (idx !== -1) $result = $result.slice(idx + 1);

      return N.wire.emit('navigate.update', { $: $result, locals: res }).then(() => {
        $('.forum-postlist > :last').after($result);

        // Update selection state
        _.intersection(topicState.selected_posts, _.map(res.posts, '_id')).forEach(postId => {
          $(`#post${postId}`)
            .addClass('forum-post__m-selected')
            .find('.forum-post__select-cb')
            .prop('checked', true);
        });

        //
        // Limit total amount of posts in DOM
        //
        let posts     = document.getElementsByClassName('forum-post');
        let cut_count = posts.length - CUT_ITEMS_MIN;

        if (cut_count > CUT_ITEMS_MAX - CUT_ITEMS_MIN) {
          let post = posts[cut_count];

          // This condition is a safeguard to prevent infinite loop,
          // which happens if we remove a post on the screen and trigger
          // prefetch in the opposite direction (test it with
          // CUT_ITEMS_MAX=10, CUT_ITEMS_MIN=0)
          if (post.getBoundingClientRect().bottom < -600) {
            let old_height = $('.forum-postlist').height();
            let old_scroll = $window.scrollTop(); // might change on remove()
            let old_length = posts.length;

            $(post).prevAll().remove();

            topicState.top_marker = $('.forum-post:first').data('post-hid');

            // update scroll so it would point at the same spot as before
            $window.scrollTop(old_scroll + $('.forum-postlist').height() - old_height);
            topicState.first_post_offset += old_length - document.getElementsByClassName('forum-post').length;
          }
        }

        // reset lock
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
      section:        topicState.section,
      topic_statuses: topicStatuses,
      subscription:   N.runtime.page_data.subscription,

      page_progress: {
        section_hid: topicState.section.hid,
        topic_hid:   topicState.topic_hid,
        current:     topicState.post_hid,
        max:         topicState.max_post
      }
    }));

  let viewportStart = $window.scrollTop() + navbarHeight;

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

  selector.find('.quote').each(function () {
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
let scrollPositionTracker = null;
let scrollPositionsKey;


function uploadScrollPositionsImmediate() {
  bag.get(scrollPositionsKey).then(positions => {
    if (positions) {
      _.forEach(positions, function (data, id) {
        N.live.emit('private.forum.marker_set_pos', {
          content_id: id,
          position: data.pos,
          max: data.max,
          category_id: data.category_id
        });
      });

      return bag.remove(scrollPositionsKey);
    }
  });
}

const uploadScrollPositions = _.debounce(uploadScrollPositionsImmediate, 2000);


// Track scroll position
//
N.wire.on('navigate.done:' + module.apiPath, function save_scroll_position_init() {
  // Skip for guests
  if (N.runtime.is_guest) return;

  scrollPositionsKey = `topics_scroll_${N.runtime.user_hid}`;

  let lastPos = -1;
  let lastRead = -1;

  scrollPositionTracker = _.debounce(function () {
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

    if (lastVisibleIdx === $posts.length - 1) {
      // Adjust for ignored posts at the end:
      //
      // If user reads last visible post in DOM, we mark last
      // loaded post instead
      //
      read = topicState.bottom_marker;
    }

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
    bag.get(scrollPositionsKey).then(positions => {
      positions = positions || {};
      positions[N.runtime.page_data.topic._id] = {
        pos,
        max: read,
        category_id: N.runtime.page_data.topic.section
      };

      // Expire after 7 days
      return bag.set(scrollPositionsKey, positions, 7 * 24 * 60 * 60).then(() => uploadScrollPositions());
    });
  }, 300, { maxWait: 300 });

  // avoid executing it on first tick because of initial scrollTop()
  setTimeout(function () {
    $window.on('scroll', scrollPositionTracker);
  }, 1);
});


// Try upload scroll positions on `navigate.exit`
//
N.wire.on('navigate.exit:' + module.apiPath, function save_scroll_position_on_exit() {
  // Skip for guests
  if (N.runtime.is_guest) return;

  uploadScrollPositions.cancel();
  uploadScrollPositionsImmediate();
});


// Teardown scroll handler
//
N.wire.on('navigate.exit:' + module.apiPath, function save_scroll_position_teardown() {
  if (scrollPositionTracker) {
    scrollPositionTracker.cancel();
  }

  $window.off('scroll', scrollPositionTracker);
  scrollPositionTracker = null;
});


///////////////////////////////////////////////////////////////////////////////
// Many posts selection
//


let selected_posts_key;
// Flag shift key pressed
let shift_key_pressed = false;
// DOM element of first selected post (for many check)
let $many_select_start;


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


// Save selected posts + debounced
//
function save_selected_posts_immediate() {
  if (topicState.selected_posts.length) {
    // Expire after 1 day
    bag.set(selected_posts_key, topicState.selected_posts, 60 * 60 * 24);
  } else {
    bag.remove(selected_posts_key);
  }
}
const save_selected_posts = _.debounce(save_selected_posts_immediate, 500);


// Load previously selected posts
//
N.wire.on('navigate.done:' + module.apiPath, function topic_load_previously_selected_posts() {
  selected_posts_key = `topic_selected_posts_${N.runtime.user_hid}_${topicState.topic_hid}`;

  $(document)
    .on('keyup', key_up)
    .on('keydown', key_down);

  // Don't need wait here
  bag.get(selected_posts_key)
    .then(ids => {
      topicState.selected_posts = ids || [];
      topicState.selected_posts.forEach(postId => {
        $(`#post${postId}`)
          .addClass('forum-post__m-selected')
          .find('.forum-post__select-cb')
          .prop('checked', true);
      });
    })
    .then(updateTopicState)
    .catch(() => {}); // Suppress storage errors
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
      if ($many_select_start) {

        // If many select started
        //
        let $post = data.$this.closest('.forum-post');
        let $start = $many_select_start;
        let postsBetween;

        $many_select_start = null;

        // If current after `$many_select_start`
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

          $(this).find('.forum-post__select-cb').prop('checked', true);
          $(this).addClass('forum-post__m-selected');
        });

        topicState.selected_posts.push(postId);
        $post.addClass('forum-post__m-selected');


      } else if (shift_key_pressed) {
        // If many select not started and shift key pressed
        //
        let $post = data.$this.closest('.forum-post');

        $many_select_start = $post;
        $post.addClass('forum-post__m-selected');
        topicState.selected_posts.push(postId);

        N.wire.emit('notify', { type: 'info', message: t('msg_multiselect') });


      } else {
        // No many select
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

    $('.forum-post__select-cb:checked').each(function () {
      $(this)
        .prop('checked', false)
        .closest('.forum-post')
        .removeClass('forum-post__m-selected');
    });

    save_selected_posts();
    return updateTopicState();
  });


  // Delete many
  //
  N.wire.on('forum.topic:delete_many', function topic_posts_delete_many() {
    let pageParams = {};

    return N.wire.emit('navigate.get_page_raw', pageParams).then(() => {

      // If first post selected - delete topic
      if (topicState.selected_posts.indexOf(pageParams.data.topic.cache.first_post) !== -1) {
        return Promise.resolve()
          .then(() => N.wire.emit('common.blocks.confirm', t('many_delete_as_topic')))
          .then(() => delete_topic(true))
          .then(() => {
            topicState.selected_posts = [];
            save_selected_posts();
            // Don't need update topic state, because section page will be opened after `delete_topic()`
          });
      }

      let postsIds = topicState.selected_posts;
      let params = {
        canDeleteHard: N.runtime.page_data.settings.forum_mod_can_hard_delete_topics
      };

      return Promise.resolve()
        .then(() => N.wire.emit('forum.topic.posts_delete_many_dlg', params))
        .then(() => {
          let request = {
            topic_hid: topicState.topic_hid,
            posts_ids: postsIds,
            method: params.method
          };

          if (params.reason) request.reason = params.reason;

          return N.io.rpc('forum.topic.post.destroy_many', request);
        })
        .then(() => {
          topicState.selected_posts = [];
          save_selected_posts_immediate();

          return N.wire.emit('notify', { type: 'info', message: t('many_posts_deleted') });
        })
        .then(() => N.wire.emit('navigate.reload'));
    });
  });


  // Undelete many
  //
  N.wire.on('forum.topic:undelete_many', function topic_posts_undelete_many() {
    let pageParams = {};

    return N.wire.emit('navigate.get_page_raw', pageParams).then(() => {

      // If first post selected - undelete topic
      if (topicState.selected_posts.indexOf(pageParams.data.topic.cache.first_post) !== -1) {
        return Promise.resolve()
          .then(() => N.wire.emit('common.blocks.confirm', t('many_undelete_as_topic')))
          .then(() => N.io.rpc('forum.topic.undelete', { topic_hid: topicState.topic_hid }))
          .then(() => {
            topicState.selected_posts = [];
            save_selected_posts_immediate();
            return N.wire.emit('navigate.reload');
          });
      }

      let request = {
        topic_hid: topicState.topic_hid,
        posts_ids: topicState.selected_posts
      };

      return Promise.resolve()
        .then(() => N.wire.emit('common.blocks.confirm', t('many_undelete_confirm')))
        .then(() => N.io.rpc('forum.topic.post.undelete_many', request))
        .then(() => {
          topicState.selected_posts = [];
          save_selected_posts_immediate();
        })
        .then(() => N.wire.emit('notify', { type: 'info', message: t('many_posts_undeleted') }))
        .then(() => N.wire.emit('navigate.reload'));
    });
  });
});


// Teardown many post selection
//
N.wire.on('navigate.exit:' + module.apiPath, function topic_post_selection_teardown() {
  $(document)
    .off('keyup', key_up)
    .off('keydown', key_down);
});
