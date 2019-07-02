'use strict';


const _ = require('lodash');
const ScrollableList = require('nodeca.core/lib/app/scrollable_list');


// Page state
//
// - hid:                current section hid
// - current_offset:     offset of the current topic (first in the viewport)
// - topic_count:        total amount of topics
// - selected_topics:    array of selected topics in current topic
//
let pageState = {};
let scrollable_list;

let $window = $(window);


function load(start, direction) {
  return N.io.rpc('forum.section.list.by_range', {
    section_hid:  pageState.hid,
    last_post_id: start,
    before:       direction === 'top' ? N.runtime.page_data.pagination.per_page : 0,
    after:        direction === 'bottom' ? N.runtime.page_data.pagination.per_page : 0
  }).then(res => {
    pageState.topic_count = res.pagination.total;

    return N.wire.emit('common.blocks.navbar.blocks.page_progress:update', {
      max: pageState.topic_count
    }).then(() => {
      return {
        $html: $(N.runtime.render('forum.blocks.topics_list', res)),
        locals: res,
        offset: res.pagination.chunk_offset,
        reached_end: res.topics.length !== N.runtime.page_data.pagination.per_page
      };
    });
  }).catch(err => {
    // User deleted, refreshing the page so user can see the error
    if (err.code === N.io.NOT_FOUND) return N.wire.emit('navigate.reload');
    throw err;
  });
}


// Use a separate debouncer that only fires when user stops scrolling,
// so it's executed a lot less frequently.
//
// The reason is that `history.replaceState` is very slow in FF
// on large pages: https://bugzilla.mozilla.org/show_bug.cgi?id=1250972
//
let update_url = _.debounce((item, index, item_offset) => {
  let href, state;

  if (item) {
    state = {
      hid:    $(item).data('topic-hid'),
      offset: item_offset
    };
  }

  // save current offset, and only update url if offset is different,
  // it protects url like /f1/topic23/page4 from being overwritten instantly
  if (pageState.current_offset !== index) {
    /* eslint-disable no-undefined */
    href = N.router.linkTo('forum.section', {
      section_hid: pageState.hid,
      topic_hid:   item ? $(item).data('topic-hid') : undefined
    });

    if ((pageState.current_offset >= 0) !== (index >= 0)) {
      $('meta[name="robots"]').remove();

      if (index >= 0) {
        $('head').append($('<meta name="robots" content="noindex,follow">'));
      }
    }

    pageState.current_offset = index;
  }

  N.wire.emit('navigate.replace', { href, state })
        .catch(err => N.wire.emit('error', err));
}, 500);


function on_list_scroll(item, index, item_offset) {
  N.wire.emit('common.blocks.navbar.blocks.page_progress:update', {
    current: index + 1 // `+1` because offset is zero based
  }).catch(err => N.wire.emit('error', err));

  update_url(item, index, item_offset);
}


/////////////////////////////////////////////////////////////////////
// init on page load
//
N.wire.on('navigate.done:' + module.apiPath, function page_setup(data) {
  let pagination     = N.runtime.page_data.pagination,
      last_topic_hid = $('.forum-section-root').data('last-topic-hid');

  pageState.hid                = data.params.section_hid;
  pageState.current_offset     = -1;
  pageState.topic_count        = pagination.total;
  pageState.selected_topics    = [];

  let navbar_height = parseInt($('body').css('margin-top'), 10) + parseInt($('body').css('padding-top'), 10);

  // account for some spacing between posts
  navbar_height += 32;

  let scroll_done = false;

  // If user returns from a topic page back to section, highlight a linked topic
  //
  // TODO: check if we can parse anchor more gently
  //
  let anchor = data.anchor || '';
  let el;

  if (!scroll_done && anchor.match(/^#cat\d+$/)) {
    el = $(anchor);

    if (el.length && el.hasClass('forum-section')) {
      $window.scrollTop(el.offset().top - navbar_height);
      el.addClass('forum-section__m-highlight');
      scroll_done = true;
    }
  }

  if (!scroll_done && data.state && typeof data.state.hid !== 'undefined' && typeof data.state.offset !== 'undefined') {
    el = $('#topic' + data.state.hid);

    if (el.length) {
      $window.scrollTop(el.offset().top - navbar_height + data.state.offset);
      scroll_done = true;
    }
  }

  if (!scroll_done && data.params.topic_hid) {
    el = $('#topic' + data.params.topic_hid);

    if (el.length) {
      $window.scrollTop(el.offset().top - navbar_height);
      el.addClass('forum-topicline__m-highlight');
      scroll_done = true;
    }
  }


  // If we're on the first page, scroll to the top;
  // otherwise, scroll to the first topic on that page
  //
  if (!scroll_done) {
    if (pagination.chunk_offset > 1 && $('.forum-topiclist').length) {
      $window.scrollTop($('.forum-topiclist').offset().top - navbar_height);

    } else {
      $window.scrollTop(0);
    }

    scroll_done = true;
  }

  // disable automatic scroll to an anchor in the navigator
  data.no_scroll = true;

  scrollable_list = new ScrollableList({
    N,
    list_selector:               '.forum-topiclist',
    item_selector:               '.forum-topicline',
    placeholder_top_selector:    '.forum-section__loading-prev',
    placeholder_bottom_selector: '.forum-section__loading-next',
    get_content_id:              topic => $(topic).data('last-post'),
    load,
    reached_top:                 pagination.chunk_offset === 0,
    reached_bottom:              last_topic_hid === $('.forum-topicline:last').data('topic-hid'),
    index_offset:                pagination.chunk_offset,
    navbar_height,
    // whenever there are more than 600 topics, cut off-screen topics down to 400
    need_gc:                     count => (count > 600 ? count - 400 : 0),
    on_list_scroll
  });
});


N.wire.on('navigate.exit:' + module.apiPath, function page_teardown() {
  scrollable_list.destroy();
  scrollable_list = null;
  update_url.cancel();
  pageState = {};
});


/////////////////////////////////////////////////////////////////////
// Update section state
//
function updateSectionState() {
  // Need to re-render reply button and dropdown here
  $('.forum-section__toolbar-controls')
    .replaceWith(N.runtime.render(module.apiPath + '.blocks.toolbar_controls', {
      section:      N.runtime.page_data.section,
      settings:     N.runtime.page_data.settings,
      subscription: N.runtime.page_data.subscription,
      selected_cnt: pageState.selected_topics.length
    }));
}


N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  // Section subscription handler
  //
  N.wire.on(module.apiPath + ':subscription', function section_subscription(data) {
    let hid = data.$this.data('section-hid');
    let params = { subscription: data.$this.data('section-subscription') };

    return Promise.resolve()
      .then(() => N.wire.emit('forum.section.subscription', params))
      .then(() => N.io.rpc('forum.section.subscribe', { section_hid: hid, type: params.subscription }))
      .then(() => {
        N.runtime.page_data.subscription = params.subscription;
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
    if (scrollable_list.reached_top) {
      $window.scrollTop(0);
      return;
    }

    return N.wire.emit('navigate.to', {
      apiPath: 'forum.section',
      params: {
        section_hid: pageState.hid
      }
    });
  });


  // User presses "end" button
  //
  N.wire.on(module.apiPath + ':nav_to_end', function navigate_to_end() {
    if (scrollable_list.reached_bottom) {
      $window.scrollTop($(document).height());
      return;
    }

    return N.wire.emit('navigate.to', {
      apiPath: 'forum.section',
      params: {
        section_hid: pageState.hid,
        topic_hid:   $('.forum-section-root').data('last-topic-hid')
      }
    });
  });
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
  if (pageState.selected_topics.length) {
    // Expire after 1 day
    bag.set(selected_topics_key, pageState.selected_topics, 60 * 60 * 24).catch(() => {});
  } else {
    bag.remove(selected_topics_key).catch(() => {});
  }
}
const save_selected_topics = _.debounce(save_selected_topics_immediate, 500);


function update_selection_state(container) {
  pageState.selected_topics.forEach(topicHid => {
    container.find(`#topic${topicHid}`).addBack(`#topic${topicHid}`)
      .addClass('forum-topicline__m-selected')
      .find('.forum-topicline__select-cb')
      .prop('checked', true);
  });
}

N.wire.on('navigate.update', function update_selected_topics(data) {
  if (!pageState.hid) return; // not on section page

  $('.forum-section-root').toggleClass('forum-section-root__m-first-page', scrollable_list.reached_top);
  update_selection_state(data.$);
});


// Load previously selected topics
//
N.wire.on('navigate.done:' + module.apiPath, function section_load_previously_selected_topics() {
  selected_topics_key = `section_selected_topics_${N.runtime.user_hid}_${pageState.hid}`;

  $(document)
    .on('keyup', key_up)
    .on('keydown', key_down);

  // Don't need wait here
  bag.get(selected_topics_key)
    .then(hids => {
      hids = hids || [];
      pageState.selected_topics = hids;
      update_selection_state($(document));

      return hids.length ? updateSectionState() : null;
    })
    .catch(() => {}); // Suppress storage errors
});


// Init handlers
//
N.wire.once('navigate.done:' + module.apiPath, function section_topics_selection_init() {

  // Update array of selected topics on selection change
  //
  N.wire.on(module.apiPath + ':topic_check', function section_topic_select(data) {
    let topicHid = data.$this.data('topic-hid');

    if (data.$this.is(':checked') && pageState.selected_topics.indexOf(topicHid) === -1) {
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

          if (pageState.selected_topics.indexOf(hid) === -1) {
            pageState.selected_topics.push(hid);
          }

          $(this)
            .addClass('forum-topicline__m-selected')
            .find('.forum-topicline__select-cb').prop('checked', true);
        });

        pageState.selected_topics.push(topicHid);
        $topic.addClass('forum-topicline__m-selected');


      } else if (shift_key_pressed) {
        // If many select not started and shift key pressed
        //
        let $topic = data.$this.closest('.forum-topicline');

        $many_select_start = $topic;
        $topic.addClass('forum-topicline__m-selected');
        pageState.selected_topics.push(topicHid);

        N.wire.emit('notify.info', t('msg_multiselect'));


      } else {
        // No many select
        //
        data.$this.closest('.forum-topicline').addClass('forum-topicline__m-selected');
        pageState.selected_topics.push(topicHid);
      }


    } else if (!data.$this.is(':checked') && pageState.selected_topics.indexOf(topicHid) !== -1) {
      // Unselect
      //
      data.$this.closest('.forum-topicline').removeClass('forum-topicline__m-selected');
      pageState.selected_topics = _.without(pageState.selected_topics, topicHid);
    }

    save_selected_topics();
    return updateSectionState();
  });


  // Unselect all topics
  //
  N.wire.on(module.apiPath + ':topics_unselect', function section_topic_unselect() {
    pageState.selected_topics = [];

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
          section_hid: pageState.hid,
          topics_hids: pageState.selected_topics,
          method: params.method
        };

        if (params.reason) request.reason = params.reason;

        return N.io.rpc('forum.section.topic.destroy_many', request);
      })
      .then(() => {
        pageState.selected_topics = [];
        save_selected_topics_immediate();

        return N.wire.emit('notify.info', t('many_topics_deleted'));
      })
      .then(() => N.wire.emit('navigate.reload'));
  });


  // Undelete topics
  //
  N.wire.on(module.apiPath + ':undelete_many', function section_topic_undelete_many() {
    let request = {
      section_hid: pageState.hid,
      topics_hids: pageState.selected_topics
    };

    return Promise.resolve()
      .then(() => N.wire.emit('common.blocks.confirm', t('many_undelete_confirm')))
      .then(() => N.io.rpc('forum.section.topic.undelete_many', request))
      .then(() => {
        pageState.selected_topics = [];
        save_selected_topics_immediate();
      })
      .then(() => N.wire.emit('notify.info', t('many_topics_undeleted')))
      .then(() => N.wire.emit('navigate.reload'));
  });


  // Close topics
  //
  N.wire.on(module.apiPath + ':close_many', function section_topic_close_many() {
    let request = {
      section_hid: pageState.hid,
      topics_hids: pageState.selected_topics
    };

    return Promise.resolve()
      .then(() => N.wire.emit('common.blocks.confirm', t('many_close_confirm')))
      .then(() => N.io.rpc('forum.section.topic.close_many', request))
      .then(() => {
        pageState.selected_topics = [];
        save_selected_topics_immediate();
      })
      .then(() => N.wire.emit('notify.info', t('many_topics_closed')))
      .then(() => N.wire.emit('navigate.reload'));
  });


  // Open topics
  //
  N.wire.on(module.apiPath + ':open_many', function section_topic_open_many() {
    let request = {
      section_hid: pageState.hid,
      topics_hids: pageState.selected_topics
    };

    return Promise.resolve()
      .then(() => N.wire.emit('common.blocks.confirm', t('many_open_confirm')))
      .then(() => N.io.rpc('forum.section.topic.open_many', request))
      .then(() => {
        pageState.selected_topics = [];
        save_selected_topics_immediate();
      })
      .then(() => N.wire.emit('notify.info', t('many_topics_opened')))
      .then(() => N.wire.emit('navigate.reload'));
  });


  // Move topics
  //
  N.wire.on(module.apiPath + ':move_many', function section_topic_move_many() {
    let params = {
      section_hid_from: pageState.hid
    };

    return Promise.resolve()
      .then(() => N.wire.emit('forum.section.topic_move_many_dlg', params))
      .then(() => {
        let request = {
          section_hid_from: params.section_hid_from,
          section_hid_to: params.section_hid_to,
          topics_hids: pageState.selected_topics
        };

        return N.io.rpc('forum.section.topic.move_many', request);
      })
      .then(() => {
        pageState.selected_topics = [];
        save_selected_topics_immediate();
      })
      .then(() => N.wire.emit('notify.info', t('many_topics_moved')))
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
