'use strict';


var _        = require('lodash');


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
//
var sectionState = {};

var scrollHandler = null;
var navbarHeight = $('.nav-horiz').height();


/////////////////////////////////////////////////////////////////////
// init on page load
//
N.wire.on('navigate.done:' + module.apiPath, function page_setup(data) {
  sectionState.hid               = data.params.hid;
  sectionState.current_offset    = N.runtime.page_data.pagination.chunk_offset;
  sectionState.max_page          = N.runtime.page_data.pagination.page_max;
  sectionState.topics_per_page   = N.runtime.page_data.pagination.per_page;
  sectionState.prev_page_loading = false;
  sectionState.next_page_loading = false;
  sectionState.first_post_id     = $('.forum-section-root').data('first-post-id');
  sectionState.last_post_id      = $('.forum-section-root').data('last-post-id');
  sectionState.reached_start     = (data.params.page === 1) || !sectionState.first_post_id;
  sectionState.reached_end       = (data.params.page === sectionState.max_page) || !sectionState.last_post_id;

  // If we're on the first page, scroll to the top;
  // otherwise, scroll to the first topic on that page
  //
  if (data.params.page > 1 && $('.forum-topiclist').length) {
    $(window).scrollTop($('.forum-topiclist').offset().top - navbarHeight);

  } else {
    $(window).scrollTop(0);
  }

  // disable automatic scroll to an anchor in the navigator
  data.no_scroll = true;
});


N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  // Click topic create
  //
  N.wire.on('forum.section:create', function reply(data, callback) {
    N.wire.emit('forum.topic.create:begin', {
      section_hid: data.$this.data('section-hid'),
      section_title: data.$this.data('section-title')
    }, callback);
  });

  // Called when user submits dropdown menu form
  //
  N.wire.on('forum.section:nav_to_page', function navigate_to_page(data) {
    var page = +data.fields.page;
    if (!page) { return; }

    N.wire.emit('navigate.to', {
      apiPath: 'forum.section',
      params: {
        hid:   sectionState.hid,
        page:  page
      }
    });
  });


  ///////////////////////////////////////////////////////////////////////////
  // Whenever we are close to beginning/end of topic list, check if we can
  // load more pages from the server
  //

  // an amount of topics we try to load when user scrolls to the end of the page
  var LOAD_TOPICS_COUNT = N.runtime.page_data.pagination.per_page;

  // an amount of topics from top/bottom that triggers prefetch in that direction
  var LOAD_BORDER_SIZE = 10;

  function _load_prev_page() {
    if (sectionState.prev_page_loading || sectionState.reached_start) { return; }
    sectionState.prev_page_loading = true;

    N.io.rpc('forum.section.list.by_range', {
      section_hid:   sectionState.hid,
      last_post_id:  sectionState.first_post_id,
      before:        LOAD_TOPICS_COUNT,
      after:         0
    }).done(function (res) {
      if (!res.topics) {
        return;
      }

      if (res.topics.length !== LOAD_TOPICS_COUNT) {
        sectionState.reached_start = true;
        $('.forum-section-root').addClass('forum-section-root__m-first-page');
      }

      if (res.topics.length === 0) {
        return;
      }

      sectionState.first_post_id = res.topics[0].cache.last_post;

      res.pagination = {
        page_max:     sectionState.max_page,
        per_page:     sectionState.topics_per_page,
        chunk_offset: $('.forum-topiclist > :first').data('offset') - res.topics.length
      };

      var old_height = $('.forum-topiclist').height();

      // render & inject topics list
      var $result = $(N.runtime.render('forum.blocks.topics_list', res));
      $('.forum-topiclist > :first').before($result);

      // update scroll so it would point at the same spot as before
      $(window).scrollTop($(window).scrollTop() + $('.forum-topiclist').height() - old_height);

    }).finish(function () {
      sectionState.prev_page_loading = false;
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
    }).done(function (res) {
      if (!res.topics) {
        return;
      }

      if (res.topics.length !== LOAD_TOPICS_COUNT) {
        sectionState.reached_end = true;
      }

      if (res.topics.length === 0) {
        return;
      }

      sectionState.last_post_id = res.topics[res.topics.length - 1].cache.last_post;

      res.pagination = {
        page_max:     sectionState.max_page,
        per_page:     sectionState.topics_per_page,
        chunk_offset: $('.forum-topiclist > :last').data('offset') + 1
      };

      // render & inject topics list
      var $result = $(N.runtime.render('forum.blocks.topics_list', res));
      $('.forum-topiclist > :last').after($result);

    }).finish(function () {
      sectionState.next_page_loading = false;
    });
  }

  var load_prev_page = _.debounce(_load_prev_page, 500, { leading: true, maxWait: 500 });
  var load_next_page = _.debounce(_load_next_page, 500, { leading: true, maxWait: 500 });

  // If we're browsing one of the first/last 5 topics, load more pages from
  // the server in that direction.
  //
  // This method is synchronous, so rpc requests won't delay progress bar
  // updates.
  //
  N.wire.on('forum.section:scroll', function check_load_more_pages() {
    var topics        = $('.forum-topicline'),
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
  N.wire.on('forum.section:scroll', function update_progress() {
    var topics        = $('.forum-topicline'),
        viewportStart = $(window).scrollTop() + navbarHeight,
        offset,
        currentIdx,
        page;

    // Get offset of the first topic in the viewport
    //
    currentIdx = _.sortedIndex(topics, null, function (topic) {
      if (!topic) { return viewportStart; }
      return $(topic).offset().top + $(topic).height();
    });

    if (currentIdx >= topics.length) { currentIdx = topics.length - 1; }

    offset = $(topics[currentIdx]).data('offset');
    if (offset === sectionState.current_offset) { return; }

    sectionState.current_offset = offset;

    page = Math.max(Math.floor(offset / sectionState.topics_per_page) + 1, 1);

    N.wire.emit('navigate.replace', {
      href: N.router.linkTo('forum.section', {
        hid:  sectionState.hid,
        page: page
      })
    });

    N.wire.emit('forum.section.blocks.page_progress:update', {
      current:  page,
      max:      sectionState.max_page
    });
  });
});


/////////////////////////////////////////////////////////////////////
// Update navbar when user scrolls the page
//
N.wire.on('navigate.done:' + module.apiPath, function scroll_tracker_init() {
  var $window = $(window);

  if ($('.forum-topiclist').length === 0) { return; }

  scrollHandler = _.debounce(function update_navbar_on_scroll() {
    var viewportStart = $window.scrollTop() + navbarHeight;

    // If we scroll below top border of the first topic,
    // show the secondary navbar
    //
    if ($('.forum-topiclist').offset().top < viewportStart) {
      $('.navbar').addClass('navbar__m-secondary');
    } else {
      $('.navbar').removeClass('navbar__m-secondary');
    }

    N.wire.emit('forum.section:scroll');
  }, 100, { maxWait: 100 });

  $(window).on('scroll', scrollHandler);
});

N.wire.on('navigate.exit:' + module.apiPath, function scroll_tracker_teardown() {
  if (!scrollHandler) { return; }
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
      settings:   N.runtime.page_data.settings,
      section:    N.runtime.page_data.section,

      page_progress: {
        current:  Math.floor(sectionState.current_offset / sectionState.topics_per_page) + 1,
        max:      sectionState.max_page
      }
    }));

  var viewportStart = $(window).scrollTop() + navbarHeight;

  // If we scroll below top border of the first topic,
  // show the secondary navbar
  //
  if ($('.forum-topiclist').length && $('.forum-topiclist').offset().top < viewportStart) {
    $('.navbar').addClass('navbar__m-secondary');
  } else {
    $('.navbar').removeClass('navbar__m-secondary');
  }

  N.wire.emit('forum.section:scroll');
});

N.wire.on('navigate.exit:' + module.apiPath, function navbar_teardown() {
  $('.navbar-alt').empty();
  $('.navbar').removeClass('navbar__m-secondary');
});
