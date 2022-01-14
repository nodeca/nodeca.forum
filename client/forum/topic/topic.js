// Forum topic page logic
//
'use strict';


const _              = require('lodash');
const charcount      = require('charcount');
const topicStatuses  = '$$ JSON.stringify(N.models.forum.Topic.statuses) $$';
const bag            = require('bagjs')({ prefix: 'nodeca' });
const ScrollableList = require('nodeca.core/lib/app/scrollable_list');


// Page state
//
// - section:            current section
// - topic_hid:          current topic hid
// - post_hid:           current post hid
// - max_post:           hid of the last post in this topic
// - post_count:         an amount of visible posts in the topic
// - posts_per_page:     an amount of visible posts per page
// - topic_last_ts:      last post creation time (used for edit confirmation)
// - selected_posts:     array of selected posts in current topic
//
let pageState = {};
let scrollable_list;
let navbar_height;

let $window = $(window);


function load(start, direction) {
  return N.io.rpc('forum.topic.list.by_range', {
    topic_hid: pageState.topic_hid,
    post_hid:  start,
    before:    direction === 'top' ? N.runtime.page_data.pagination.per_page : 0,
    after:     direction === 'bottom' ? N.runtime.page_data.pagination.per_page : 0
  }).then(res => {
    pageState.post_count = res.topic.cache.post_count;
    pageState.topic_last_ts = res.topic.cache.last_ts;

    if (res.topic.cache.last_post_hid !== pageState.max_post) {
      pageState.max_post = res.topic.cache.last_post_hid;

      N.wire.emit('common.blocks.navbar.blocks.page_progress:update', {
        max:         pageState.max_post,
        link_bottom: N.router.linkTo('forum.topic', {
          section_hid: pageState.section.hid,
          topic_hid:   pageState.topic_hid,
          post_hid:    pageState.max_post
        })
      });
    }

    if (!res.posts || !res.posts.length) return;

    pageState.top_marker = res.posts[0].hid;

    res.pagination = {
      // used in paginator
      total:        pageState.post_count,
      per_page:     N.runtime.page_data.pagination.per_page,
      chunk_offset: direction === 'top' ?
                    this.index_offset :
                    this.index_offset + $('.forum-post').length - 1
    };

    res.posts_list_before_post = N.runtime.page_data.posts_list_before_post;
    res.posts_list_after_post  = N.runtime.page_data.posts_list_after_post;

    let reached_end = direction === 'top' ?
                      !res.posts.length || res.posts[0].hid <= 1 :
                      !res.posts.length || res.posts[res.posts.length - 1].hid >= pageState.max_post;

    return {
      $html: $(N.runtime.render('forum.blocks.posts_list', res)),
      locals: res,
      offset: res.pagination.chunk_offset,
      reached_end
    };
  }).catch(err => {
    // Topic moved or deleted, refreshing the page so user can see the error
    if (err.code === N.io.NOT_FOUND) return N.wire.emit('navigate.reload');
    throw err;
  });
}


let update_url;

function on_list_scroll(item, index, item_offset) {
  // Use a separate debouncer that only fires when user stops scrolling,
  // so it's executed a lot less frequently.
  //
  // The reason is that `history.replaceState` is very slow in FF
  // on large pages: https://bugzilla.mozilla.org/show_bug.cgi?id=1250972
  //
  update_url = update_url || _.debounce((item, index, item_offset) => {
    let newHid = item ?
                 $(item).data('post-hid') :
                 ($('.forum-post:first').data('post-hid') || 1);

    let href;
    /* eslint-disable no-undefined */
    let state = {
      hid:    newHid,
      offset: item ? item_offset : undefined
    };

    // save current hid to pageState, and only update url if hid is different,
    // it protects url like /f1/topic23/page4 from being overwritten instantly
    if (pageState.post_hid !== newHid) {
      pageState.post_hid = newHid;

      href = N.router.linkTo('forum.topic', {
        section_hid:  pageState.section.hid,
        topic_hid:    pageState.topic_hid,
        post_hid:     pageState.post_hid
      });
    }

    N.wire.emit('navigate.replace', { href, state })
          .catch(err => N.wire.emit('error', err));
  }, 500);

  N.wire.emit('common.blocks.navbar.blocks.page_progress:update', {
    current: item ? $(item).data('post-hid') : ($('.forum-post:first').data('post-hid') || 1)
  }).catch(err => N.wire.emit('error', err));

  update_url(item, index, item_offset);
}


/////////////////////////////////////////////////////////////////////
// init on page load
//
N.wire.on('navigate.done:' + module.apiPath, function page_setup(data) {
  pageState.section         = N.runtime.page_data.section;
  pageState.topic_hid       = data.params.topic_hid;
  pageState.post_hid        = data.params.post_hid || 1;
  pageState.post_count      = N.runtime.page_data.pagination.total;
  pageState.posts_per_page  = N.runtime.page_data.pagination.per_page;
  pageState.max_post        = N.runtime.page_data.topic.cache.last_post_hid;
  pageState.topic_last_ts   = N.runtime.page_data.topic.cache.last_ts;
  pageState.selected_posts  = [];

  navbar_height = parseInt($('body').css('margin-top'), 10) + parseInt($('body').css('padding-top'), 10);

  // account for some spacing between posts
  navbar_height += 50;

  let scroll_done = false;

  // If user moves to a page (e.g. from a search engine),
  // we should scroll him to the top post on that page
  //
  if (data.params.page && data.params.page > 1) {
    pageState.post_hid = $('.forum-post:first').data('post-hid');
  }

  // Scroll to a post linked in params (if any)
  //
  if (!scroll_done && data.state && typeof data.state.hid !== 'undefined' && typeof data.state.offset !== 'undefined') {
    let posts = $('.forum-post');
    let i = _.sortedIndexBy(posts, null, post => {
      if (!post) return data.state.hid;
      return $(post).data('post-hid');
    });

    // `i` is the index of a post with given hid if it exists,
    // otherwise it's a position of the first post with hid more than that
    //
    if (i >= posts.length) i = posts.length - 1;
    $window.scrollTop($(posts[i]).offset().top - navbar_height + data.state.offset);
    scroll_done = true;
  }

  if (!scroll_done && pageState.post_hid > 1) {
    let posts = $('.forum-post');
    let i = _.sortedIndexBy(posts, null, post => {
      if (!post) return pageState.post_hid;
      return $(post).data('post-hid');
    });

    // `i` is the index of a post with given hid if it exists,
    // otherwise it's a position of the first post with hid more than that
    //
    if (i >= posts.length) { i = posts.length - 1; }
    $window.scrollTop($(posts[i]).offset().top - navbar_height);
    $(posts[i]).addClass('forum-post__m-flash');
    scroll_done = true;
  }

  if (!scroll_done) {
    // If user clicks on a link to the first post of the topic,
    // we should scroll to the top.
    //
    $window.scrollTop(0);
    scroll_done = true;
  }

  // disable automatic scroll to an anchor in the navigator
  data.no_scroll = true;

  let top_post_hid    = $('.forum-post:first').data('post-hid');
  let bottom_post_hid = $('.forum-post:last').data('post-hid');

  scrollable_list = new ScrollableList({
    N,
    list_selector:               '.forum-postlist',
    item_selector:               '.forum-post',
    placeholder_top_selector:    '.forum-topic__loading-prev',
    placeholder_bottom_selector: '.forum-topic__loading-next',
    get_content_id:              post => $(post).data('post-hid'),
    load,
    reached_top:                 !top_post_hid || top_post_hid <= 1,
    reached_bottom:              !bottom_post_hid || bottom_post_hid >= pageState.max_post,
    index_offset:                N.runtime.page_data.pagination.chunk_offset,
    navbar_height,
    // whenever there are more than 300 posts, cut off-screen posts down to 200
    need_gc:                     count => (count > 300 ? count - 200 : 0),
    on_list_scroll
  });
});


// Open move topic dialog when user goes to #move_to_XX anchor
//
N.wire.on('navigate.done:' + module.apiPath, function page_setup_move(data) {
  let anchor = data.anchor || '';
  let m;
  if (!(m = anchor.match(/^#move_to_(\d+)$/))) return;

  let params = { section_hid_from: pageState.section.hid, section_hid_default: +m[1] };

  Promise.resolve()
    .then(() => N.wire.emit('forum.topic.topic_move_dlg', params))
    .then(() => {
      let request = {
        section_hid_from: params.section_hid_from,
        section_hid_to: params.section_hid_to,
        topic_hid: pageState.topic_hid
      };

      return N.io.rpc('forum.topic.move', request);
    })
    .then(() => N.wire.emit('notify.info', t('move_topic_done')))
    .then(() => {
      let section_hid = params.section_hid_to;
      let topic_hid = pageState.topic_hid;
      return N.wire.emit('navigate.to', N.router.linkTo('forum.topic', { section_hid, topic_hid }));
    })
    .catch(err => N.wire.emit('error', err));
});


N.wire.on('navigate.exit:' + module.apiPath, function page_teardown() {
  scrollable_list.destroy();
  scrollable_list = null;

  if (update_url) update_url.cancel();

  pageState = {};
});


/////////////////////////////////////////////////////////////////////
// Update topic menu and modifiers by page data
//
function updateTopicState() {
  // Need to re-render reply button and dropdown here
  let templateParams = {
    topic:        N.runtime.page_data.topic,
    section:      N.runtime.page_data.section,
    settings:     N.runtime.page_data.settings,
    subscription: N.runtime.page_data.subscription,
    selected_cnt: pageState.selected_posts.length
  };

  // render dropdown in menu
  $('.page-actions__dropdown').replaceWith(
    N.runtime.render(module.apiPath + '.blocks.page_actions.dropdown', templateParams));

  // render buttons+dropdown in page head
  $('.page-actions').replaceWith(
    N.runtime.render(module.apiPath + '.blocks.page_actions', templateParams));

  let modifiers = {
    'forum-topic-root__m-open': topicStatuses.OPEN,
    'forum-topic-root__m-closed': topicStatuses.CLOSED,
    'forum-topic-root__m-deleted': topicStatuses.DELETED,
    'forum-topic-root__m-deleted-hard': topicStatuses.DELETED_HARD,
    'forum-topic-root__m-pinned': topicStatuses.PINNED
  };

  let $topicRoot = $('.forum-topic-root');

  for (let [ modifier, state ] of Object.entries(modifiers)) {
    if (N.runtime.page_data.topic.st === state || N.runtime.page_data.topic.ste === state) {
      $topicRoot.addClass(modifier);
    } else {
      $topicRoot.removeClass(modifier);
    }
  }
}


/////////////////////////////////////////////////////////////////////
// setup 'forum.topic.*' handlers
//


// Delete topic
//
function delete_topic(as_moderator) {
  let request = {
    topic_hid: pageState.topic_hid,
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
      N.wire.emit('navigate.to', { apiPath: 'forum.section', params: { section_hid: pageState.section.hid } })
    );
}


N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  // Check if user can create a post here
  //
  N.wire.before(module.apiPath + ':reply', { priority: -20 }, function reply_permission_check() {
    if (!N.runtime.page_data.settings.forum_can_reply || !N.runtime.page_data.section.is_writable) {
      N.wire.emit('notify', t('err_section_not_writable'));
      throw 'CANCELED';
    }

    if (N.runtime.page_data.topic.st !== topicStatuses.OPEN && N.runtime.page_data.topic.ste !== topicStatuses.OPEN) {
      N.wire.emit('notify', t('err_topic_closed'));
      throw 'CANCELED';
    }
  });


  // Display confirmation when answering in an inactive topic
  //
  N.wire.before(module.apiPath + ':reply', function old_reply_confirm(data) {
    let topic_inactive_for_days = Math.floor((Date.now() - new Date(pageState.topic_last_ts)) / (24 * 60 * 60 * 1000));

    if (topic_inactive_for_days >= N.runtime.page_data.settings.forum_reply_old_post_threshold) {
      return N.wire.emit('common.blocks.confirm', {
        html: t('old_topic_reply_confirm', { count: topic_inactive_for_days })
      });
    }

    if (data.$this.closest('.forum-post').data('post-id')) {
      let post_time = new Date(data.$this.closest('.forum-post').data('post-ts')).getTime();
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
      topic_hid:   pageState.topic_hid,
      topic_title: N.runtime.page_data.topic.title,
      section_hid: pageState.section.hid,
      post_id:     data.$this.closest('.forum-post').data('post-id'),
      post_hid:    data.$this.closest('.forum-post').data('post-hid')
    });
  });


  // Click report button
  //
  N.wire.on(module.apiPath + ':report', function report(data) {
    let params = { messages: t('@forum.abuse_report.messages'), current_section: pageState.section.hid };
    let post_id = data.$this.data('post-id');

    return Promise.resolve()
      .then(() => N.wire.emit('common.blocks.abuse_report_dlg', params))
      .then(() => {
        let rpc_args = { post_id };

        if (params.move_to) {
          rpc_args.move_to = params.move_to;
        } else {
          rpc_args.message = params.message;
        }

        return N.io.rpc('forum.topic.post.abuse_report', rpc_args);
      })
      .then(() => N.wire.emit('notify.info', t('abuse_reported')));
  });


  // Click on post edit
  //
  N.wire.on(module.apiPath + ':post_edit', function reply(data) {
    return N.wire.emit('forum.topic.post.edit:begin', {
      topic_hid:    pageState.topic_hid,
      topic_title:  N.runtime.page_data.topic.title,
      section_hid:  pageState.section.hid,
      post_id:      data.$this.data('post-id'),
      post_hid:     data.$this.data('post-hid'),
      as_moderator: data.$this.data('as-moderator') || false
    });
  });


  // Show post IP
  //
  N.wire.on(module.apiPath + ':post_show_ip', function post_show_ip(data) {
    return N.wire.emit('forum.topic.ip_info_dlg', { post_id: data.$this.data('post-id') });
  });


  // Add infraction
  //
  N.wire.on(module.apiPath + ':add_infraction', function add_infraction(data) {
    let postId = data.$this.data('post-id');
    let params = { post_id: postId };

    return Promise.resolve()
      .then(() => N.wire.emit('users.blocks.add_infraction_dlg', params))
      .then(() => N.io.rpc('forum.topic.post.add_infraction', params))
      .then(() => N.io.rpc('forum.topic.list.by_ids', { topic_hid: pageState.topic_hid, posts_ids: [ postId ] }))
      .then(res => {
        let $result = $(N.runtime.render('forum.blocks.posts_list', res));

        return N.wire.emit('navigate.content_update', {
          $: $result,
          locals: res,
          $replace: $(`#post${postId}`)
        });
      })
      .then(() => N.wire.emit('notify.info', t('infraction_added')));
  });


  // Expand deleted or hellbanned post
  //
  N.wire.on(module.apiPath + ':post_expand', function post_expand(data) {
    let postId = data.$this.data('post-id');

    return Promise.resolve()
      .then(() => N.io.rpc('forum.topic.list.by_ids', { topic_hid: pageState.topic_hid, posts_ids: [ postId ] }))
      .then(res => {
        let $result = $(N.runtime.render('forum.blocks.posts_list', Object.assign(res, { expand: true })));

        if (pageState.selected_posts.indexOf(postId) !== -1) {
          $result
            .addClass('forum-post__m-selected')
            .find('.forum-post__select-cb').prop('checked', true);
        }

        return N.wire.emit('navigate.content_update', {
          $: $result,
          locals: res,
          $replace: $(`#post${postId}`)
        });
      });
  });


  // Pin/unpin topic
  //
  N.wire.on(module.apiPath + ':pin', function topic_pin(data) {
    let topicHid = data.$this.data('topic-hid');
    let unpin = data.$this.data('unpin') || false;

    return Promise.resolve()
      .then(() => N.io.rpc('forum.topic.pin', { topic_hid: topicHid, unpin }))
      .then(res => {
        N.runtime.page_data.topic.st = res.topic.st;
        N.runtime.page_data.topic.ste = res.topic.ste;
        N.runtime.page_data.topic.edit_count = res.topic.edit_count;
      })
      .then(updateTopicState)
      .then(() => {
        if (unpin) return N.wire.emit('notify.info', t('unpin_topic_done'));
        return N.wire.emit('notify.info', t('pin_topic_done'));
      });
  });


  // Move topic
  //
  N.wire.on(module.apiPath + ':move', function topic_move(data) {
    let topicHid = data.$this.data('topic-hid');
    let params = { section_hid_from: pageState.section.hid };

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
      .then(() => N.wire.emit('notify.info', t('move_topic_done')))
      .then(() => N.wire.emit('navigate.reload'));
  });


  // Close/open topic handler
  //
  N.wire.on(module.apiPath + ':close', function topic_close(data) {
    let params = {
      topic_hid: data.$this.data('topic-hid'),
      reopen: data.$this.data('reopen') || false,
      as_moderator: data.$this.data('as-moderator') || false
    };

    return Promise.resolve()
      .then(() => N.io.rpc('forum.topic.close', params))
      .then(res => {
        N.runtime.page_data.topic.st = res.topic.st;
        N.runtime.page_data.topic.ste = res.topic.ste;
        N.runtime.page_data.topic.edit_count = res.topic.edit_count;
      })
      .then(updateTopicState)
      .then(() => {
        if (params.reopen) return N.wire.emit('notify.info', t('open_topic_done'));
        return N.wire.emit('notify.info', t('close_topic_done'));
      });
  });


  // Edit title handler
  //
  N.wire.on(module.apiPath + ':edit_title', function title_edit(data) {
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
        }).then(res => {
          $title.text(value);

          // update title in navbar
          $('.navbar-alt__title').text(value);

          N.runtime.page_data.topic.edit_count = res.topic.edit_count;

          // refresh edit counter
          return updateTopicState();
        });
      }
    };

    return N.wire.emit('common.blocks.microedit', params);
  });


  // Undelete topic handler
  //
  N.wire.on(module.apiPath + ':topic_undelete', function topic_undelete(data) {
    let topicHid = data.$this.data('topic-hid');

    return Promise.resolve()
      .then(() => N.io.rpc('forum.topic.undelete', { topic_hid: topicHid }))
      .then(res => {
        N.runtime.page_data.topic.st = res.topic.st;
        N.runtime.page_data.topic.ste = res.topic.ste;
        N.runtime.page_data.topic.edit_count = res.topic.edit_count;
      })
      .then(updateTopicState)
      .then(() => N.wire.emit('notify.info', t('undelete_topic_done')));
  });


  // Vote post
  //
  N.wire.on(module.apiPath + ':post_vote', function post_vote(data) {
    let postId = data.$this.data('post-id');
    let value = +data.$this.data('value');
    let topicHid = pageState.topic_hid;

    return Promise.resolve()
      .then(() => N.io.rpc('forum.topic.post.vote', { post_id: postId, value }))
      .then(() => N.io.rpc('forum.topic.list.by_ids', { topic_hid: topicHid, posts_ids: [ postId ] }))
      .then(res => {
        let $result = $(N.runtime.render('forum.blocks.posts_list', res));

        return N.wire.emit('navigate.content_update', {
          $: $result,
          locals: res,
          $replace: $(`#post${postId}`)
        });
      });
  });


  // Undelete post handler
  //
  N.wire.on(module.apiPath + ':post_undelete', function post_undelete(data) {
    let postId = data.$this.data('post-id');

    return N.io.rpc('forum.topic.post.undelete', { post_id: postId })
      .then(() => N.io.rpc('forum.topic.list.by_ids', { topic_hid: pageState.topic_hid, posts_ids: [ postId ] }))
      .then(res => {
        // update progress bar, only relevant if we're undeleting the last post
        if (res.topic.cache.last_post_hid !== pageState.max_post) {
          pageState.max_post = res.topic.cache.last_post_hid;

          N.wire.emit('common.blocks.navbar.blocks.page_progress:update', {
            max:         pageState.max_post,
            link_bottom: N.router.linkTo('forum.topic', {
              section_hid: pageState.section.hid,
              topic_hid:   pageState.topic_hid,
              post_hid:    pageState.max_post
            })
          });
        }

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

    return Promise.resolve()
      .then(() => N.wire.emit('forum.topic.topic_subscription', params))
      .then(() => N.io.rpc('forum.topic.change_subscription', { topic_hid: hid, type: params.subscription }))
      .then(() => {
        N.runtime.page_data.subscription = params.subscription;
      })
      .then(updateTopicState);
  });


  // Delete topic handler
  //
  N.wire.on(module.apiPath + ':topic_delete', function topic_delete(data) {
    return delete_topic(data.$this.data('as-moderator'));
  });


  // Delete post handler
  //
  N.wire.on(module.apiPath + ':post_delete', function post_delete(data) {
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
      .then(() => N.io.rpc('forum.topic.list.by_ids', { topic_hid: pageState.topic_hid, posts_ids: [ postId ] }))
      .then(res => {
        // update progress bar, only relevant if we're deleting the last post
        if (res.topic.cache.last_post_hid !== pageState.max_post) {
          pageState.max_post = res.topic.cache.last_post_hid;

          N.wire.emit('common.blocks.navbar.blocks.page_progress:update', {
            max:         pageState.max_post,
            link_bottom: N.router.linkTo('forum.topic', {
              section_hid: pageState.section.hid,
              topic_hid:   pageState.topic_hid,
              post_hid:    pageState.max_post
            })
          });
        }

        if (res.posts.length === 0) {
          $post.fadeOut(function () {
            $post.remove();
          });
          return;
        }

        let $result = $(N.runtime.render('forum.blocks.posts_list', res));

        return N.wire.emit('navigate.content_update', {
          $: $result,
          locals: res,
          $replace: $post
        });
      });
  });


  // Add/remove bookmark
  //
  N.wire.on(module.apiPath + ':post_bookmark', function post_bookmark(data) {
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
    // if the first post is already loaded, scroll to the top
    if (scrollable_list.reached_top) {
      $window.scrollTop(0);
      return;
    }

    return N.wire.emit('navigate.to', {
      apiPath: 'forum.topic',
      params: {
        section_hid:  pageState.section.hid,
        topic_hid:    pageState.topic_hid,
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
        section_hid:  pageState.section.hid,
        topic_hid:    pageState.topic_hid,
        post_hid:     post
      }
    });
  });


  // User presses "end" button
  //
  N.wire.on(module.apiPath + ':nav_to_end', function navigate_to_end() {
    // if the last post is already loaded, scroll to the bottom
    if (scrollable_list.reached_bottom) {
      $window.scrollTop($('.forum-post:last').offset().top - navbar_height);
      return;
    }

    // Note: this will scroll to the last post, not to the real bottom like
    // browsers do. There is a difference if footer is large enough.
    //
    return N.wire.emit('navigate.to', {
      apiPath: 'forum.topic',
      params: {
        section_hid:  pageState.section.hid,
        topic_hid:    pageState.topic_hid,
        post_hid:     pageState.max_post
      }
    });
  });


  // Open an editor when user selects post text and presses "quote" button
  //
  N.wire.before('common.blocks.markup.selection:quote', function open_editor_on_selection_quote(data) {
    if (!pageState.topic_hid) return; // not on topic page
    if (N.MDEdit?.exists()) return; // editor already opened

    return N.wire.emit(module.apiPath + ':reply', {
      event: data.event,
      $this: $(data.markup_node)
    }).then(() => new Promise(resolve => {
      // wait for draft to fully load
      N.MDEdit.__layout__.on('ready.nd.mdedit', resolve);
    }));
  });
});


///////////////////////////////////////////////////////////////////////////////
// Set a "same page" modifier to all block quotes which point to the same topic
//

// current topic params if we're on the topic page, null otherwise;
let topicParams;


// Set `quote__m-local` or `quote__m-outer` class on every quote
// depending on whether its origin is in the same topic or not.
//
function set_quote_modifiers(container) {
  // if topicParams is not set, it means we aren't on a topic page
  if (!topicParams) return;

  container.find('.quote').each(function () {
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


N.wire.on('navigate.content_update', function set_quote_modifiers_on_update(data) {
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
      for (let [ id, data ] of Object.entries(positions)) {
        N.live.emit('private.forum.marker_set_pos', {
          content_id: id,
          position: data.pos,
          max: data.max,
          category_id: data.category_id
        });
      }

      return bag.remove(scrollPositionsKey);
    }
  })
  .catch(() => {}); // Suppress storage errors
}

const uploadScrollPositions = _.debounce(uploadScrollPositionsImmediate, 2000);


// Track scroll position
//
N.wire.on('navigate.done:' + module.apiPath, function save_scroll_position_init() {
  // Skip for guests
  if (!N.runtime.is_member) return;

  scrollPositionsKey = `topics_scroll_${N.runtime.user_hid}`;

  let lastPos = -1;
  let lastRead = -1;

  scrollPositionTracker = _.debounce(function () {
    let viewportStart = $window.scrollTop() + navbar_height;
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
    bag.get(scrollPositionsKey).then(positions => {
      positions = positions || {};
      positions[N.runtime.page_data.topic._id] = {
        pos,
        max: read,
        category_id: N.runtime.page_data.topic.section
      };

      // Expire after 7 days
      return bag.set(scrollPositionsKey, positions, 7 * 24 * 60 * 60).then(() => uploadScrollPositions());
    })
    .catch(() => {}); // Suppress storage errors
  }, 300, { maxWait: 300 });

  // avoid executing it on first tick because of initial scrollTop()
  setTimeout(function () {
    // remember scroll position on init,
    // needed if user navigates to a specific post then moves away without scrolling
    scrollPositionTracker();

    $window.on('scroll', scrollPositionTracker);
  }, 1);
});


// Try upload scroll positions on `navigate.exit`
//
N.wire.on('navigate.exit:' + module.apiPath, function save_scroll_position_on_exit() {
  // Skip for guests
  if (!N.runtime.is_member) return;

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
  if (pageState.selected_posts.length) {
    // Expire after 1 day
    bag.set(selected_posts_key, pageState.selected_posts, 60 * 60 * 24).catch(() => {});
  } else {
    bag.remove(selected_posts_key).catch(() => {});
  }
}
const save_selected_posts = _.debounce(save_selected_posts_immediate, 500);


function update_selection_state(container) {
  pageState.selected_posts.forEach(postId => {
    container.find(`#post${postId}`).addBack(`#post${postId}`)
      .addClass('forum-post__m-selected')
      .find('.forum-post__select-cb')
      .prop('checked', true);
  });
}

N.wire.on('navigate.content_update', function update_selected_topics(data) {
  if (!pageState.topic_hid) return; // not on topic page

  update_selection_state(data.$);
});


// Load previously selected posts
//
N.wire.on('navigate.done:' + module.apiPath, function topic_load_previously_selected_posts() {
  selected_posts_key = `topic_selected_posts_${N.runtime.user_hid}_${pageState.topic_hid}`;

  $(document)
    .on('keyup', key_up)
    .on('keydown', key_down);

  // Don't need wait here
  bag.get(selected_posts_key)
    .then(ids => {
      ids = ids || [];
      pageState.selected_posts = ids;
      update_selection_state($(document));

      return ids.length ? updateTopicState() : null;
    })
    .catch(() => {}); // Suppress storage errors
});


// Init handlers
//
N.wire.once('navigate.done:' + module.apiPath, function topic_post_selection_init() {

  // Update array of selected posts on selection change
  //
  N.wire.on('forum.topic:post_check', function topic_post_select(data) {
    let postId = data.$this.data('post-id');

    if (data.$this.is(':checked') && pageState.selected_posts.indexOf(postId) === -1) {
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

          if (pageState.selected_posts.indexOf(id) === -1) {
            pageState.selected_posts.push(id);
          }

          $(this).find('.forum-post__select-cb').prop('checked', true);
          $(this).addClass('forum-post__m-selected');
        });

        pageState.selected_posts.push(postId);
        $post.addClass('forum-post__m-selected');


      } else if (shift_key_pressed) {
        // If many select not started and shift key pressed
        //
        let $post = data.$this.closest('.forum-post');

        $many_select_start = $post;
        $post.addClass('forum-post__m-selected');
        pageState.selected_posts.push(postId);

        N.wire.emit('notify.info', t('msg_multiselect'));


      } else {
        // No many select
        //
        data.$this.closest('.forum-post').addClass('forum-post__m-selected');
        pageState.selected_posts.push(postId);
      }


    } else if (!data.$this.is(':checked') && pageState.selected_posts.indexOf(postId) !== -1) {
      // Unselect
      //
      data.$this.closest('.forum-post').removeClass('forum-post__m-selected');
      pageState.selected_posts = pageState.selected_posts.filter(x => x !== postId);
    }

    save_selected_posts();
    return updateTopicState();
  });


  // Unselect all posts
  //
  N.wire.on('forum.topic:posts_unselect', function topic_posts_unselect() {
    pageState.selected_posts = [];

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
      if (pageState.selected_posts.indexOf(pageParams.data.topic.cache.first_post) !== -1) {
        return Promise.resolve()
          .then(() => N.wire.emit('common.blocks.confirm', t('many_delete_as_topic')))
          .then(() => delete_topic(true))
          .then(() => {
            pageState.selected_posts = [];
            save_selected_posts();
            // Don't need update topic state, because section page will be opened after `delete_topic()`
          });
      }

      let postsIds = pageState.selected_posts;
      let params = {
        canDeleteHard: N.runtime.page_data.settings.forum_mod_can_hard_delete_topics
      };

      return Promise.resolve()
        .then(() => N.wire.emit('forum.topic.posts_delete_many_dlg', params))
        .then(() => {
          let request = {
            topic_hid: pageState.topic_hid,
            posts_ids: postsIds,
            method: params.method
          };

          if (params.reason) request.reason = params.reason;

          return N.io.rpc('forum.topic.post.destroy_many', request);
        })
        .then(() => {
          pageState.selected_posts = [];
          save_selected_posts_immediate();

          return N.wire.emit('notify.info', t('many_posts_deleted'));
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
      if (pageState.selected_posts.indexOf(pageParams.data.topic.cache.first_post) !== -1) {
        return Promise.resolve()
          .then(() => N.wire.emit('common.blocks.confirm', t('many_undelete_as_topic')))
          .then(() => N.io.rpc('forum.topic.undelete', { topic_hid: pageState.topic_hid }))
          .then(() => {
            pageState.selected_posts = [];
            save_selected_posts_immediate();
            return N.wire.emit('navigate.reload');
          });
      }

      let request = {
        topic_hid: pageState.topic_hid,
        posts_ids: pageState.selected_posts
      };

      return Promise.resolve()
        .then(() => N.wire.emit('common.blocks.confirm', t('many_undelete_confirm')))
        .then(() => N.io.rpc('forum.topic.post.undelete_many', request))
        .then(() => {
          pageState.selected_posts = [];
          save_selected_posts_immediate();
        })
        .then(() => N.wire.emit('notify.info', t('many_posts_undeleted')))
        .then(() => N.wire.emit('navigate.reload'));
    });
  });


  // Show topic history popup
  //
  N.wire.on('forum.topic:topic_history', function show_topic_history(data) {
    let topic_id = data.$this.data('topic-id');

    return Promise.resolve()
      .then(() => N.io.rpc('forum.topic.show_history', { topic_id }))
      .then(res => N.wire.emit('forum.topic.topic_history_dlg', res));
  });


  // Show post history popup
  //
  N.wire.on('forum.topic:post_history', function show_post_history(data) {
    let post_id = data.$this.data('post-id');

    return Promise.resolve()
      .then(() => N.io.rpc('forum.topic.post.show_history', { post_id }))
      .then(res => N.wire.emit('forum.topic.post_history_dlg', res));
  });


  // Extend dialogs create (add title & link when available)
  N.wire.before('users.dialog.create:begin', function dialog_create_extend(params) {
    if (!topicParams) return; // not at this page
    if (!params.ref) return;  // no data to extend
    if (!/^fp:/.test(params.ref)) return; // not our data

    let post_id = params.ref.split(':')[1];
    let title   = $('.forum-topic-title__text').text();
    let hid     = $(`#post${post_id}`).data('post-hid');
    let href    = $(`#post${post_id} .forum-post__link`).attr('href');

    if (title && hid && href) {
      if (hid === 1) {
        params.text = `Re: [${title}](${href})\n\n`;
      } else {
        params.text = `Re: [#${hid}, ${title}](${href})\n\n`;
      }
    }
  });
});


// Teardown many post selection
//
N.wire.on('navigate.exit:' + module.apiPath, function topic_post_selection_teardown() {
  $(document)
    .off('keyup', key_up)
    .off('keydown', key_down);
});
