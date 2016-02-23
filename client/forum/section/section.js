'use strict';


const _ = require('lodash');


// Section state
//
// - hid:                current section hid
// - current_offset:     offset of the first topic in the viewport
// - max_page:           a number of the last page in this section
// - topics_per_page:    an amount of topics on a single page
// - prev_page_loading:  true iff request to auto-load previous page is in flight
// - next_page_loading:  true iff request to auto-load next page is in flight
// - reached_start:      true iff no more pages exist above first loaded one
// - reached_end:        true iff no more pages exist below last loaded one
// - first_post_id       id of the last post in the first loaded topic
// - last_post_id        id of the last post in the last loaded topic
// - selected_topics:    array of selected topics in current topic
//
let sectionState = {};

let scrollHandler = null;
let navbarHeight = $('.navbar').height();

// offset between navbar and the first topic
const TOP_OFFSET = 32;


/////////////////////////////////////////////////////////////////////
// init on page load
//
N.wire.on('navigate.done:' + module.apiPath, function page_setup(data) {
  let pagination     = N.runtime.page_data.pagination,
      last_topic_hid = $('.forum-section-root').data('last-topic-hid');

  sectionState.hid               = data.params.section_hid;
  sectionState.current_offset    = pagination.chunk_offset;
  sectionState.max_page          = Math.ceil(pagination.total / pagination.per_page) || 1;
  sectionState.topics_per_page   = pagination.per_page;
  sectionState.prev_page_loading = false;
  sectionState.next_page_loading = false;
  sectionState.first_post_id     = $('.forum-section-root').data('first-post-id');
  sectionState.last_post_id      = $('.forum-section-root').data('last-post-id');
  sectionState.reached_start     = (sectionState.current_offset === 0) || !sectionState.first_post_id;
  sectionState.reached_end       = (last_topic_hid === $('.forum-topicline:last').data('topic-hid')) ||
                                   !sectionState.last_post_id;
  sectionState.selected_topics   = [];

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
      $(window).scrollTop(el.offset().top - $('.navbar').height() - TOP_OFFSET);
      el.addClass('forum-section__m-highlight');
      return;
    }

  } else if (data.state && typeof data.state.hid !== 'undefined' && typeof data.state.offset !== 'undefined') {
    el = $('#topic' + data.state.hid);

    if (el.length) {
      $(window).scrollTop(el.offset().top - $('.navbar').height() - TOP_OFFSET + data.state.offset);
      return;
    }

  } else if (data.params.topic_hid) {
    el = $('#topic' + data.params.topic_hid);

    if (el.length) {
      $(window).scrollTop(el.offset().top - $('.navbar').height() - TOP_OFFSET);
      el.addClass('forum-topicline__m-highlight');
      return;
    }
  }


  // If we're on the first page, scroll to the top;
  // otherwise, scroll to the first topic on that page
  //
  if (pagination.chunk_offset > 1 && $('.forum-topiclist').length) {
    $(window).scrollTop($('.forum-topiclist').offset().top - navbarHeight);

  } else {
    $(window).scrollTop(0);
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
      $(window).scrollTop(0);
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
      $(window).scrollTop($(document).height());
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


  ///////////////////////////////////////////////////////////////////////////
  // Whenever we are close to beginning/end of topic list, check if we can
  // load more pages from the server
  //

  // an amount of topics we try to load when user scrolls to the end of the page
  let LOAD_TOPICS_COUNT = N.runtime.page_data.pagination.per_page;

  // an amount of topics from top/bottom that triggers prefetch in that direction
  let LOAD_BORDER_SIZE = 10;

  function _load_prev_page() {
    if (sectionState.prev_page_loading || sectionState.reached_start) { return; }
    sectionState.prev_page_loading = true;

    N.io.rpc('forum.section.list.by_range', {
      section_hid:   sectionState.hid,
      last_post_id:  sectionState.first_post_id,
      before:        LOAD_TOPICS_COUNT,
      after:         0
    }).then(function (res) {
      if (!res.topics) return;

      if (res.topics.length !== LOAD_TOPICS_COUNT) {
        sectionState.reached_start = true;
        $('.forum-section-root').addClass('forum-section-root__m-first-page');
      }

      if (res.topics.length === 0) return;

      sectionState.first_post_id = res.topics[0].cache.last_post;

      res.pagination = {
        total:        N.runtime.page_data.pagination.total,
        per_page:     N.runtime.page_data.pagination.per_page,
        chunk_offset: $('.forum-topiclist > :first').data('offset') - res.topics.length
      };

      let old_height = $('.forum-topiclist').height();

      // render & inject topics list
      let $result = $(N.runtime.render('forum.blocks.topics_list', res));
      $('.forum-topiclist > :first').before($result);

      // update scroll so it would point at the same spot as before
      $(window).scrollTop($(window).scrollTop() + $('.forum-topiclist').height() - old_height);

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

      sectionState.prev_page_loading = false;
    }).catch(err => {
      sectionState.prev_page_loading = false;
      N.wire.emit('error', err);
    });
  }

  function _load_next_page() {
    if (sectionState.next_page_loading || sectionState.reached_end) { return; }
    sectionState.next_page_loading = true;

    N.io.rpc('forum.section.list.by_range', {
      section_hid:   sectionState.hid,
      last_post_id:  sectionState.last_post_id,
      before:        0,
      after:         LOAD_TOPICS_COUNT
    }).then(function (res) {
      if (!res.topics) return;

      if (res.topics.length !== LOAD_TOPICS_COUNT) {
        sectionState.reached_end = true;
      }

      if (res.topics.length === 0) return;

      sectionState.last_post_id = res.topics[res.topics.length - 1].cache.last_post;

      res.pagination = {
        total:        N.runtime.page_data.pagination.total,
        per_page:     N.runtime.page_data.pagination.per_page,
        chunk_offset: $('.forum-topiclist > :last').data('offset') + 1
      };

      // render & inject topics list
      let $result = $(N.runtime.render('forum.blocks.topics_list', res));
      $('.forum-topiclist > :last').after($result);

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

      sectionState.next_page_loading = false;
    }).catch(err => {
      sectionState.next_page_loading = false;
      N.wire.emit('error', err);
    });
  }

  let load_prev_page = _.debounce(_load_prev_page, 500, { leading: true, maxWait: 500 });
  let load_next_page = _.debounce(_load_next_page, 500, { leading: true, maxWait: 500 });

  // If we're browsing one of the first/last 5 topics, load more pages from
  // the server in that direction.
  //
  // This method is synchronous, so rpc requests won't delay progress bar
  // updates.
  //
  N.wire.on(module.apiPath + ':scroll', function check_load_more_pages() {
    let topics        = $('.forum-topicline'),
        viewportStart = $(window).scrollTop() + navbarHeight,
        viewportEnd   = $(window).scrollTop() + $(window).height();

    if (topics.length <= LOAD_BORDER_SIZE || $(topics[topics.length - LOAD_BORDER_SIZE]).offset().top < viewportEnd) {
      load_next_page();
    }

    if (topics.length <= LOAD_BORDER_SIZE || $(topics[LOAD_BORDER_SIZE]).offset().top > viewportStart) {
      load_prev_page();
    }
  });


  // Update location and progress bar
  //
  N.wire.on(module.apiPath + ':scroll', function update_progress() {
    let topics         = $('.forum-topicline'),
        topicThreshold = $(window).scrollTop() + navbarHeight + TOP_OFFSET,
        offset,
        currentIdx;

    // Get offset of the first topic in the viewport
    //
    currentIdx = _.sortedIndexBy(topics, null, topic => {
      if (!topic) { return topicThreshold; }
      return $(topic).offset().top;
    });

    currentIdx--;

    let href = null;
    let state = null;

    if (currentIdx >= 0 && topics.length) {
      offset = $(topics[currentIdx]).data('offset') + 1;

      state = {
        hid:    $(topics[currentIdx]).data('topic-hid'),
        offset: topicThreshold - $(topics[currentIdx]).offset().top
      };
    } else {
      offset = 0;
    }

    // save current offset, and only update url if offset is different,
    // it protects url like /f1/topic23/page4 from being overwritten instantly
    if (sectionState.current_offset !== offset) {
      sectionState.current_offset = offset;

      /* eslint-disable no-undefined */
      href = N.router.linkTo('forum.section', {
        section_hid: sectionState.hid,
        topic_hid:   currentIdx >= 0 ? $(topics[currentIdx]).data('topic-hid') : undefined
      });
    }

    if (currentIdx >= 0) {
      if ($('meta[name="robots"]').length === 0) {
        $('head').append($('<meta name="robots" content="noindex,follow">'));
      }
    } else {
      $('meta[name="robots"]').remove();
    }

    /* eslint-disable no-undefined */
    return N.wire.emit('navigate.replace', {
      href,
      state
    }).then(() => N.wire.emit('forum.section.blocks.page_progress:update', {
      current: offset,
      max: N.runtime.page_data.pagination.total,
      per_page: N.runtime.page_data.pagination.per_page
    }));
  });
});


/////////////////////////////////////////////////////////////////////
// Show/hide navbar when user scrolls the page,
// and generate debounced "scroll" event
//
N.wire.on('navigate.done:' + module.apiPath, function scroll_tracker_init() {
  if ($('.forum-topiclist').length === 0) { return; }

  scrollHandler = _.debounce(function update_navbar_on_scroll() {
    let viewportStart = $(window).scrollTop() + navbarHeight;

    // If we scroll below top border of the first topic,
    // show the secondary navbar
    //
    if ($('.forum-topiclist').offset().top < viewportStart) {
      $('.navbar').addClass('navbar__m-secondary');
    } else {
      $('.navbar').removeClass('navbar__m-secondary');
    }

    N.wire.emit('forum.section:scroll').catch(err => {
      N.wire.emit('error', err);
    });
  }, 100, { maxWait: 100 });

  // TODO: this handler may emit ':scroll' event immediately after page load
  //       because of $(window).scrollTop() in the handler above,
  //       maybe wrap it with setTimeout(..., 1) to avoid it
  $(window).on('scroll', scrollHandler);
});

N.wire.on('navigate.exit:' + module.apiPath, function scroll_tracker_teardown() {
  if (!scrollHandler) return;
  scrollHandler.cancel();
  $(window).off('scroll', scrollHandler);
  scrollHandler = null;
});


//////////////////////////////////////////////////////////////////////////
// Replace primary navbar with alt navbar specific to this page
//
N.wire.on('navigate.done:' + module.apiPath, function navbar_setup() {
  $('.navbar-alt')
    .empty()
    .append(N.runtime.render(module.apiPath + '.navbar_alt', {
      settings:      N.runtime.page_data.settings,
      section:       N.runtime.page_data.section,
      parent_hid:    $('.forum-section-root').data('parent-hid'),
      section_level: $('.forum-section-root').data('section-level'),
      subscription:  N.runtime.page_data.subscription,

      page_progress: {
        current:        sectionState.current_offset,
        max:            N.runtime.page_data.pagination.total,
        per_page:       N.runtime.page_data.pagination.per_page,
        last_topic_hid: $('.forum-section-root').data('last-topic-hid')
      }
    }));

  let viewportStart = $(window).scrollTop() + navbarHeight;

  // If we scroll below top border of the first topic,
  // show the secondary navbar
  //
  if ($('.forum-topiclist').length && $('.forum-topiclist').offset().top < viewportStart) {
    $('.navbar').addClass('navbar__m-secondary');
  } else {
    $('.navbar').removeClass('navbar__m-secondary');
  }

  // emit initial 'scroll' event, otherwise progress bar won't get updated
  N.wire.emit('forum.section:scroll').catch(err => {
    N.wire.emit('error', err);
  });
});

N.wire.on('navigate.exit:' + module.apiPath, function navbar_teardown() {
  $('.navbar-alt').empty();
  $('.navbar').removeClass('navbar__m-secondary');
});


///////////////////////////////////////////////////////////////////////////////
// Many topics selection
//


const bag = require('bagjs')({ prefix: 'nodeca' });
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
  let key = 'section_selected_topics_' + sectionState.hid;

  if (sectionState.selected_topics.length) {
    // Expire after 1 day
    bag.set(key, sectionState.selected_topics, 60 * 60 * 24);
  } else {
    bag.remove(key);
  }
}
const save_selected_topics = _.debounce(save_selected_topics_immediate, 500);


// Load previously selected topics
//
N.wire.on('navigate.done:' + module.apiPath, function section_load_previously_selected_topics() {
  $(document)
    .on('keyup', key_up)
    .on('keydown', key_down);

  return bag.get('section_selected_topics_' + sectionState.hid)
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
});


// Teardown many topics selection
//
N.wire.on('navigate.exit:' + module.apiPath, function section_topic_selection_teardown() {
  $(document)
    .off('keyup', key_up)
    .off('keydown', key_down);
});
