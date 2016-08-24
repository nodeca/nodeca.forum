'use strict';


const _ = require('lodash');


// Section state
//
// - hid:                current section hid
// - first_offset:       offset of the first topic in the DOM
// - current_offset:     offset of the current topic (first in the viewport)
// - reached_start:      true iff no more pages exist above first loaded one
// - reached_end:        true iff no more pages exist below last loaded one
// - prev_loading_start: time when current xhr request for the previous page is started
// - next_loading_start: time when current xhr request for the next page is started
// - top_marker:         last post id of the topmost topic (for prefetch)
// - bottom_marker:      last post id of the bottom topic (for prefetch)
// - selected_topics:    array of selected topics in current topic
//
let sectionState = {};

let $window = $(window);

// offset between navbar and the first topic
const TOP_OFFSET = 32;

// whenever there are more than 600 topics, cut off-screen topics down to 400
const CUT_ITEMS_MAX = 600;
const CUT_ITEMS_MIN = 400;

const navbarHeight = parseInt($('body').css('margin-top'), 10) + parseInt($('body').css('padding-top'), 10);


/////////////////////////////////////////////////////////////////////
// init on page load
//
N.wire.on('navigate.done:' + module.apiPath, function page_setup(data) {
  let pagination     = N.runtime.page_data.pagination,
      last_topic_hid = $('.forum-section-root').data('last-topic-hid');

  sectionState.hid                = data.params.section_hid;
  sectionState.first_offset       = pagination.chunk_offset;
  sectionState.current_offset     = -1;
  sectionState.topic_count        = pagination.total;
  sectionState.reached_start      = sectionState.first_offset === 0;
  sectionState.reached_end        = last_topic_hid === $('.forum-topicline:last').data('topic-hid');
  sectionState.prev_loading_start = 0;
  sectionState.next_loading_start = 0;
  sectionState.top_marker         = $('.forum-section-root').data('top-marker');
  sectionState.bottom_marker      = $('.forum-section-root').data('bottom-marker');
  sectionState.selected_topics    = [];

  // disable automatic scroll to an anchor in the navigator
  data.no_scroll = true;

  // If user returns from a topic page back to section, highlight a linked topic
  //
  // TODO: check if we can parse anchor more gently
  //
  let anchor = data.anchor || '';
  let el;

  if (anchor.match(/^#cat\d+$/)) {
    el = $(anchor);

    if (el.length && el.hasClass('forum-section')) {
      $window.scrollTop(el.offset().top - $('.navbar').height() - TOP_OFFSET);
      el.addClass('forum-section__m-highlight');
      return;
    }

  } else if (data.state && typeof data.state.hid !== 'undefined' && typeof data.state.offset !== 'undefined') {
    el = $('#topic' + data.state.hid);

    if (el.length) {
      $window.scrollTop(el.offset().top - $('.navbar').height() - TOP_OFFSET + data.state.offset);
      return;
    }

  } else if (data.params.topic_hid) {
    el = $('#topic' + data.params.topic_hid);

    if (el.length) {
      $window.scrollTop(el.offset().top - $('.navbar').height() - TOP_OFFSET);
      el.addClass('forum-topicline__m-highlight');
      return;
    }
  }


  // If we're on the first page, scroll to the top;
  // otherwise, scroll to the first topic on that page
  //
  if (pagination.chunk_offset > 1 && $('.forum-topiclist').length) {
    $window.scrollTop($('.forum-topiclist').offset().top - $('.navbar').height());

  } else {
    $window.scrollTop(0);
  }
});


/////////////////////////////////////////////////////////////////////
// Update section state
//
function updateSectionState() {
  let params = {};

  return N.wire.emit('navigate.get_page_raw', params).then(() => {
    let data = _.assign({}, params.data, { selected_cnt: sectionState.selected_topics.length });

    // Need to re-render reply button and dropdown here
    $('.forum-section__toolbar-controls')
      .replaceWith(N.runtime.render(module.apiPath + '.blocks.toolbar_controls', data));
  });
}


N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  // Subscription section handler
  //
  N.wire.on(module.apiPath + ':subscription', function topic_subscription(data) {
    let hid = data.$this.data('section-hid');
    let params = { subscription: data.$this.data('section-subscription') };
    let pageParams = {};

    return Promise.resolve()
      .then(() => N.wire.emit('forum.section.subscription', params))
      .then(() => N.wire.emit('navigate.get_page_raw', pageParams))
      .then(() => N.io.rpc('forum.section.subscribe', { section_hid: hid, type: params.subscription }))
      .then(() => {
        pageParams.data.subscription = params.subscription;
      })
      .then(updateSectionState);
  });


  // Show list of section moderators
  //
  N.wire.on(module.apiPath + ':show_moderators', function show_moderators(data) {
    let hid = data.$this.data('section-hid');

    return Promise.resolve()
      .then(() => N.io.rpc('forum.section.show_moderators', { section_hid: hid }))
      .then(res => N.wire.emit('forum.section.moderator_info_dlg', res));
  });


  // Click topic create
  //
  N.wire.on(module.apiPath + ':create', function reply(data) {
    return N.wire.emit('forum.topic.create:begin', {
      section_hid: data.$this.data('section-hid'),
      section_title: data.$this.data('section-title')
    });
  });


  // Click mark all read
  //
  N.wire.on(module.apiPath + ':mark_read', function reply(data) {
    return N.io.rpc('forum.section.mark_read', { hid: data.$this.data('section-hid') })
      .then(() => {
        $('.forum-topicline.forum-topicline__m-new, .forum-topicline.forum-topicline__m-unread')
          .removeClass('forum-topicline__m-new')
          .removeClass('forum-topicline__m-unread');
      });
  });


  // User presses "home" button
  //
  N.wire.on(module.apiPath + ':nav_to_start', function navigate_to_start() {
    // if the first topic is already loaded, scroll to the top
    if (sectionState.reached_start) {
      $window.scrollTop(0);
      return;
    }

    return N.wire.emit('navigate.to', {
      apiPath: 'forum.section',
      params: {
        section_hid: sectionState.hid
      }
    });
  });


  // User presses "end" button
  //
  N.wire.on(module.apiPath + ':nav_to_end', function navigate_to_end() {
    if (sectionState.reached_end) {
      $window.scrollTop($(document).height());
      return;
    }

    return N.wire.emit('navigate.to', {
      apiPath: 'forum.section',
      params: {
        section_hid: sectionState.hid,
        topic_hid:   $('.forum-section-root').data('last-topic-hid')
      }
    });
  });
});


/////////////////////////////////////////////////////////////////////
// When user scrolls the page:
//
//  1. update progress bar
//  2. show/hide navbar
//
let progressScrollHandler = null;

N.wire.on('navigate.done:' + module.apiPath, function progress_updater_init() {
  if ($('.forum-topiclist').length === 0) { return; }

  progressScrollHandler = _.debounce(function update_progress_on_scroll() {
    // If we scroll below page title, show the secondary navbar
    //
    let title = document.getElementsByClassName('page-head__title');

    if (title.length && title[0].getBoundingClientRect().bottom > navbarHeight) {
      $('.navbar').removeClass('navbar__m-secondary');
    } else {
      $('.navbar').addClass('navbar__m-secondary');
    }

    //
    // Update progress bar
    //
    let topics         = document.getElementsByClassName('forum-topicline'),
        topicThreshold = navbarHeight + TOP_OFFSET,
        offset,
        currentIdx;

    // Get offset of the first topic in the viewport
    //
    currentIdx = _.sortedIndexBy(topics, null, topic => {
      if (!topic) { return topicThreshold; }
      return topic.getBoundingClientRect().top;
    }) - 1;

    offset = currentIdx + sectionState.first_offset;

    N.wire.emit('common.blocks.navbar.blocks.page_progress:update', {
      current: offset + 1 // `+1` because offset is zero based
    }).catch(err => {
      N.wire.emit('error', err);
    });
  }, 100, { maxWait: 100 });

  // avoid executing it on first tick because of initial scrollTop()
  setTimeout(function () {
    $window.on('scroll', progressScrollHandler);
  });


  // execute it once on page load
  progressScrollHandler();
});

N.wire.on('navigate.exit:' + module.apiPath, function progress_updater_teardown() {
  if (!progressScrollHandler) return;
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
  if ($('.forum-topiclist').length === 0) { return; }

  locationScrollHandler = _.debounce(function update_location_on_scroll() {
    let topics         = document.getElementsByClassName('forum-topicline'),
        topicThreshold = navbarHeight + TOP_OFFSET,
        offset         = 0,
        currentIdx;

    // Get offset of the first topic in the viewport
    //
    currentIdx = _.sortedIndexBy(topics, null, topic => {
      if (!topic) { return topicThreshold; }
      return topic.getBoundingClientRect().top;
    }) - 1;

    let href = null;
    let state = null;

    offset = currentIdx + sectionState.first_offset;

    if (currentIdx >= 0 && topics.length) {
      state = {
        hid:    $(topics[currentIdx]).data('topic-hid'),
        offset: topicThreshold - topics[currentIdx].getBoundingClientRect().top
      };
    }

    // save current offset, and only update url if offset is different,
    // it protects url like /f1/topic23/page4 from being overwritten instantly
    if (sectionState.current_offset !== offset) {
      /* eslint-disable no-undefined */
      href = N.router.linkTo('forum.section', {
        section_hid: sectionState.hid,
        topic_hid:   currentIdx >= 0 ? $(topics[currentIdx]).data('topic-hid') : undefined
      });

      if (sectionState.current_offset <= 0 && offset > 0) {
        $('head').append($('<meta name="robots" content="noindex,follow">'));
      } else if (sectionState.current_offset > 0 && offset <= 0) {
        $('meta[name="robots"]').remove();
      }

      sectionState.current_offset = offset;
    }

    N.wire.emit('navigate.replace', { href, state });
  }, 500);

  // avoid executing it on first tick because of initial scrollTop()
  setTimeout(function () {
    $window.on('scroll', locationScrollHandler);
  }, 1);
});

N.wire.on('navigate.exit:' + module.apiPath, function location_updater_teardown() {
  if (!locationScrollHandler) return;
  locationScrollHandler.cancel();
  $window.off('scroll', locationScrollHandler);
  locationScrollHandler = null;
});


///////////////////////////////////////////////////////////////////////////////
// Many topics selection
//


const bag = require('bagjs')({ prefix: 'nodeca' });
let selected_topics_key;
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


// Save selected topics + debounced
//
function save_selected_topics_immediate() {
  if (sectionState.selected_topics.length) {
    // Expire after 1 day
    bag.set(selected_topics_key, sectionState.selected_topics, 60 * 60 * 24).catch(() => {});
  } else {
    bag.remove(selected_topics_key).catch(() => {});
  }
}
const save_selected_topics = _.debounce(save_selected_topics_immediate, 500);


// Load previously selected topics
//
N.wire.on('navigate.done:' + module.apiPath, function section_load_previously_selected_topics() {
  selected_topics_key = `section_selected_topics_${N.runtime.user_hid}_${sectionState.hid}`;

  $(document)
    .on('keyup', key_up)
    .on('keydown', key_down);

  // Don't need wait here
  bag.get(selected_topics_key)
    .then(hids => {
      sectionState.selected_topics = hids || [];
      sectionState.selected_topics.forEach(topicHid => {
        $(`#topic${topicHid}`)
          .addClass('forum-topicline__m-selected')
          .find('.forum-topicline__select-cb')
          .prop('checked', true);
      });
    })
    .then(updateSectionState)
    .catch(() => {}); // Suppress storage errors
});


// Init handlers
//
N.wire.once('navigate.done:' + module.apiPath, function section_topics_selection_init() {

  // Update array of selected topics on selection change
  //
  N.wire.on(module.apiPath + ':topic_check', function section_topic_select(data) {
    let topicHid = data.$this.data('topic-hid');

    if (data.$this.is(':checked') && sectionState.selected_topics.indexOf(topicHid) === -1) {
      // Select
      //
      if ($many_select_start) {

        // If many select started
        //
        let $topic = data.$this.closest('.forum-topicline');
        let $start = $many_select_start;
        let topicsBetween;

        $many_select_start = null;

        // If current after `$many_select_start`
        if ($start.index() < $topic.index()) {
          // Get topics between start and current
          topicsBetween = $start.nextUntil($topic, '.forum-topicline');
        } else {
          // Between current and start (in reverse order)
          topicsBetween = $topic.nextUntil($start, '.forum-topicline');
        }

        topicsBetween.each(function () {
          let hid = $(this).data('topic-hid');

          if (sectionState.selected_topics.indexOf(hid) === -1) {
            sectionState.selected_topics.push(hid);
          }

          $(this)
            .addClass('forum-topicline__m-selected')
            .find('.forum-topicline__select-cb').prop('checked', true);
        });

        sectionState.selected_topics.push(topicHid);
        $topic.addClass('forum-topicline__m-selected');


      } else if (shift_key_pressed) {
        // If many select not started and shift key pressed
        //
        let $topic = data.$this.closest('.forum-topicline');

        $many_select_start = $topic;
        $topic.addClass('forum-topicline__m-selected');
        sectionState.selected_topics.push(topicHid);

        N.wire.emit('notify', { type: 'info', message: t('msg_multiselect') });


      } else {
        // No many select
        //
        data.$this.closest('.forum-topicline').addClass('forum-topicline__m-selected');
        sectionState.selected_topics.push(topicHid);
      }


    } else if (!data.$this.is(':checked') && sectionState.selected_topics.indexOf(topicHid) !== -1) {
      // Unselect
      //
      data.$this.closest('.forum-topicline').removeClass('forum-topicline__m-selected');
      sectionState.selected_topics = _.without(sectionState.selected_topics, topicHid);
    }

    save_selected_topics();
    return updateSectionState();
  });


  // Unselect all topics
  //
  N.wire.on(module.apiPath + ':topics_unselect', function section_topic_unselect() {
    sectionState.selected_topics = [];

    $('.forum-topicline__select-cb:checked').each(function () {
      $(this)
        .prop('checked', false)
        .closest('.forum-topicline')
        .removeClass('forum-topicline__m-selected');
    });

    save_selected_topics();
    return updateSectionState();
  });


  // Delete topics
  //
  N.wire.on(module.apiPath + ':delete_many', function section_topic_delete_many() {
    let params = {
      canDeleteHard: N.runtime.page_data.settings.forum_mod_can_hard_delete_topics
    };

    return Promise.resolve()
      .then(() => N.wire.emit('forum.section.topic_delete_many_dlg', params))
      .then(() => {
        let request = {
          section_hid: sectionState.hid,
          topics_hids: sectionState.selected_topics,
          method: params.method
        };

        if (params.reason) request.reason = params.reason;

        return N.io.rpc('forum.section.topic.destroy_many', request);
      })
      .then(() => {
        sectionState.selected_topics = [];
        save_selected_topics_immediate();

        return N.wire.emit('notify', { type: 'info', message: t('many_topics_deleted') });
      })
      .then(() => N.wire.emit('navigate.reload'));
  });


  // Undelete topics
  //
  N.wire.on(module.apiPath + ':undelete_many', function section_topic_undelete_many() {
    let request = {
      section_hid: sectionState.hid,
      topics_hids: sectionState.selected_topics
    };

    return Promise.resolve()
      .then(() => N.wire.emit('common.blocks.confirm', t('many_undelete_confirm')))
      .then(() => N.io.rpc('forum.section.topic.undelete_many', request))
      .then(() => {
        sectionState.selected_topics = [];
        save_selected_topics_immediate();
      })
      .then(() => N.wire.emit('notify', { type: 'info', message: t('many_topics_undeleted') }))
      .then(() => N.wire.emit('navigate.reload'));
  });


  // Close topics
  //
  N.wire.on(module.apiPath + ':close_many', function section_topic_close_many() {
    let request = {
      section_hid: sectionState.hid,
      topics_hids: sectionState.selected_topics
    };

    return Promise.resolve()
      .then(() => N.wire.emit('common.blocks.confirm', t('many_close_confirm')))
      .then(() => N.io.rpc('forum.section.topic.close_many', request))
      .then(() => {
        sectionState.selected_topics = [];
        save_selected_topics_immediate();
      })
      .then(() => N.wire.emit('notify', { type: 'info', message: t('many_topics_closed') }))
      .then(() => N.wire.emit('navigate.reload'));
  });


  // Open topics
  //
  N.wire.on(module.apiPath + ':open_many', function section_topic_open_many() {
    let request = {
      section_hid: sectionState.hid,
      topics_hids: sectionState.selected_topics
    };

    return Promise.resolve()
      .then(() => N.wire.emit('common.blocks.confirm', t('many_open_confirm')))
      .then(() => N.io.rpc('forum.section.topic.open_many', request))
      .then(() => {
        sectionState.selected_topics = [];
        save_selected_topics_immediate();
      })
      .then(() => N.wire.emit('notify', { type: 'info', message: t('many_topics_opend') }))
      .then(() => N.wire.emit('navigate.reload'));
  });


  // Move topics
  //
  N.wire.on(module.apiPath + ':move_many', function section_topic_move_many() {
    let params = {
      section_hid_from: sectionState.hid
    };

    return Promise.resolve()
      .then(() => N.wire.emit('forum.section.topic_move_many_dlg', params))
      .then(() => {
        let request = {
          section_hid_from: params.section_hid_from,
          section_hid_to: params.section_hid_to,
          topics_hids: sectionState.selected_topics
        };

        return N.io.rpc('forum.section.topic.move_many', request);
      })
      .then(() => {
        sectionState.selected_topics = [];
        save_selected_topics_immediate();
      })
      .then(() => N.wire.emit('notify', { type: 'info', message: t('many_topics_moved') }))
      .then(() => N.wire.emit('navigate.reload'));
  });


  ///////////////////////////////////////////////////////////////////////////
  // Whenever we are close to beginning/end of topic list, check if we can
  // load more pages from the server
  //

  // an amount of topics we try to load when user scrolls to the end of the page
  const LOAD_TOPICS_COUNT = N.runtime.page_data.pagination.per_page;

  // A delay after failed xhr request (delay between successful requests
  // is set with affix `throttle` argument)
  //
  // For example, suppose user continuously scrolls. If server is up, each
  // subsequent request will be sent each 100 ms. If server goes down, the
  // interval between request initiations goes up to 2000 ms.
  //
  const LOAD_AFTER_ERROR = 2000;

  N.wire.on(module.apiPath + ':load_prev', function load_prev_page() {
    if (sectionState.reached_start) return;

    let last_post_id = sectionState.top_marker;

    // No topics on the page
    if (!last_post_id) return;

    let now = Date.now();

    // `prev_loading_start` is the last request start time, which is reset to 0 on success
    //
    // Thus, successful requests can restart immediately, but failed ones
    // will have to wait `LOAD_AFTER_ERROR` ms.
    //
    if (Math.abs(sectionState.prev_loading_start - now) < LOAD_AFTER_ERROR) return;

    sectionState.prev_loading_start = now;

    N.io.rpc('forum.section.list.by_range', {
      section_hid:   sectionState.hid,
      last_post_id,
      before:        LOAD_TOPICS_COUNT,
      after:         0
    }).then(function (res) {
      if (!res.topics) return;

      if (res.topics.length !== LOAD_TOPICS_COUNT) {
        sectionState.reached_start = true;
        $('.forum-section-root').addClass('forum-section-root__m-first-page');
      }

      if (res.topics.length === 0) return;

      sectionState.top_marker = res.topics[0].cache.last_post;

      // remove duplicate topics
      res.topics.forEach(topic => $(`#topic${topic.hid}`).remove());

      let old_height = $('.forum-topiclist').height();

      // render & inject topics list
      let $result = $(N.runtime.render('forum.blocks.topics_list', res));
      $('.forum-topiclist').prepend($result);

      // update scroll so it would point at the same spot as before
      $window.scrollTop($window.scrollTop() + $('.forum-topiclist').height() - old_height);

      sectionState.first_offset  = res.pagination.chunk_offset;
      sectionState.topic_count   = res.pagination.total;

      // Update selection state
      _.intersection(sectionState.selected_topics, _.map(res.topics, 'hid')).forEach(topicHid => {
        $(`#topic${topicHid}`)
          .addClass('forum-topicline__m-selected')
          .find('.forum-topicline__select-cb')
          .prop('checked', true);
      });

      // update prev/next metadata
      $('link[rel="prev"]').remove();

      if (res.head.prev) {
        let link = $('<link rel="prev">');

        link.attr('href', res.head.prev);
        $('head').append(link);
      }

      //
      // Limit total amount of posts in DOM
      //
      let topics    = document.getElementsByClassName('forum-topicline');
      let cut_count = topics.length - CUT_ITEMS_MIN;

      if (cut_count > CUT_ITEMS_MAX - CUT_ITEMS_MIN) {
        let topic = topics[topics.length - cut_count - 1];

        // This condition is a safeguard to prevent infinite loop,
        // which happens if we remove a post on the screen and trigger
        // prefetch in the opposite direction (test it with
        // CUT_ITEMS_MAX=10, CUT_ITEMS_MIN=0)
        if (topic.getBoundingClientRect().top > $window.height() + 600) {
          $(topic).nextAll().remove();

          // Update range for the next time we'll be doing prefetch
          sectionState.bottom_marker = $('.forum-topicline:last').data('last-post');

          sectionState.reached_end = false;
        }
      }

      // reset lock
      sectionState.prev_loading_start = 0;

      return N.wire.emit('common.blocks.navbar.blocks.page_progress:update', {
        max: sectionState.topic_count
      });
    }).catch(err => {
      N.wire.emit('error', err);
    });
  });


  N.wire.on(module.apiPath + ':load_next', function load_next_page() {
    if (sectionState.reached_end) return;

    let last_post_id = sectionState.bottom_marker;

    // No topics on the page
    if (!last_post_id) return;

    let now = Date.now();

    // `next_loading_start` is the last request start time, which is reset to 0 on success
    //
    // Thus, successful requests can restart immediately, but failed ones
    // will have to wait `LOAD_AFTER_ERROR` ms.
    //
    if (Math.abs(sectionState.next_loading_start - now) < LOAD_AFTER_ERROR) return;

    sectionState.next_loading_start = now;

    N.io.rpc('forum.section.list.by_range', {
      section_hid:   sectionState.hid,
      last_post_id,
      before:        0,
      after:         LOAD_TOPICS_COUNT
    }).then(function (res) {
      if (!res.topics) return;

      if (res.topics.length !== LOAD_TOPICS_COUNT) {
        sectionState.reached_end = true;
      }

      if (res.topics.length === 0) return;

      sectionState.bottom_marker = res.topics[res.topics.length - 1].cache.last_post;

      let old_height = $('.forum-topiclist').height();

      // remove duplicate topics
      let deleted_count = res.topics.filter(topic => {
        let el = $(`#topic${topic.hid}`);

        if (el.length) {
          el.remove();
          return true;
        }
      }).length;

      // update scroll so it would point at the same spot as before
      if (deleted_count > 0) {
        $window.scrollTop($window.scrollTop() + $('.forum-topiclist').height() - old_height);
      }

      sectionState.first_offset = res.pagination.chunk_offset - $('.forum-topicline').length;
      sectionState.topic_count  = res.pagination.total;

      // render & inject topics list
      let $result = $(N.runtime.render('forum.blocks.topics_list', res));
      $('.forum-topiclist').append($result);

      // Workaround for FF bug, possibly this one:
      // https://github.com/nodeca/nodeca.core/issues/2
      //
      // When user scrolls down and we insert content to the end
      // of the page, and the page is large enough (~1000 topics
      // or more), next scrollTop() read on 'scroll' event may
      // return invalid (too low) value.
      //
      // Reading scrollTop in the same tick seem to prevent this
      // from happening.
      //
      $window.scrollTop();

      // Update selection state
      _.intersection(sectionState.selected_topics, _.map(res.topics, 'hid')).forEach(topicHid => {
        $(`#topic${topicHid}`)
          .addClass('forum-topicline__m-selected')
          .find('.forum-topicline__select-cb')
          .prop('checked', true);
      });

      // update next/next metadata
      $('link[rel="next"]').remove();

      if (res.head.next) {
        let link = $('<link rel="next">');

        link.attr('href', res.head.next);
        $('head').append(link);
      }

      //
      // Limit total amount of topics in DOM
      //
      let topics    = document.getElementsByClassName('forum-topicline');
      let cut_count = topics.length - CUT_ITEMS_MIN;

      if (cut_count > CUT_ITEMS_MAX - CUT_ITEMS_MIN) {
        let topic = topics[cut_count];

        // This condition is a safeguard to prevent infinite loop,
        // which happens if we remove a post on the screen and trigger
        // prefetch in the opposite direction (test it with
        // CUT_ITEMS_MAX=10, CUT_ITEMS_MIN=0)
        if (topic.getBoundingClientRect().bottom < -600) {
          let old_height = $('.forum-topiclist').height();
          let old_scroll = $window.scrollTop(); // might change on remove()
          let old_length = topics.length;

          $(topic).prevAll().remove();

          // Update range for the next time we'll be doing prefetch
          sectionState.top_marker = $('.forum-topicline:first').data('last-post');

          // update scroll so it would point at the same spot as before
          $window.scrollTop(old_scroll + $('.forum-topiclist').height() - old_height);
          sectionState.first_offset += old_length - document.getElementsByClassName('forum-topicline').length;

          sectionState.reached_start = false;
        }
      }

      // reset lock
      sectionState.next_loading_start = 0;

      return N.wire.emit('common.blocks.navbar.blocks.page_progress:update', {
        max: sectionState.topic_count
      });
    }).catch(err => {
      N.wire.emit('error', err);
    });
  });
});


// Teardown many topics selection
//
N.wire.on('navigate.exit:' + module.apiPath, function section_topic_selection_teardown() {
  $(document)
    .off('keyup', key_up)
    .off('keydown', key_down);
});
