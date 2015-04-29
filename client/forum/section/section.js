'use strict';


var _        = require('lodash');


// Section state
//
// - hid:       current section hid
// - page:      current page
// - max_page:  max page
//
var sectionState = {};

var scrollHandler = null;
var navbarHeight = $('.nav-horiz').height();


/////////////////////////////////////////////////////////////////////
// init on page load
//
N.wire.on('navigate.done:' + module.apiPath, function page_setup(data) {
  sectionState.hid       = data.params.hid;
  sectionState.page      = N.runtime.page_data.page.current;
  sectionState.max_page  = N.runtime.page_data.page.max;
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


  ////////////////////////////////////////////////////////////////////////////////
  // "More topics" button logic

  N.wire.on('forum.section.append_next_page', function append_next_page(data, callback) {
    var $button = data.$this;
    var new_url = $button.attr('href');
    var params = { section_hid: $button.data('section'), page: $button.data('page') };

    N.io.rpc('forum.section.list.by_page', params).done(function (res) {

      // if no topics - just disable 'More' button
      if (!res.topics || !res.topics.length) {
        N.wire.emit('notify', {
          type: 'warning',
          message: t('error_no_more_topics')
        });
        $button.addClass('hidden');

        callback();
        return;
      }

      res.show_page_number = res.page.current;

      // render & inject topics list
      var $result = $(N.runtime.render('forum.blocks.topics_list', res));
      $('.forum-topiclist > :last').after($result);

      // update button data & state
      $button.data('page', res.page.current + 1);

      $button.attr('href', N.router.linkTo('forum.section', {
        hid:          res.section.hid,
        page:         res.page.current + 1
      }));

      if (res.page.current === res.page.max) {
        $button.addClass('hidden');
      }

      // update pager
      $('._pagination').html(
        N.runtime.render('common.blocks.pagination', {
          route:    'forum.section',
          params:   { hid: res.section.hid },
          current:  res.page.current,
          max: res.page.max
        })
      );

      // update history / url / title
      N.wire.emit('navigate.replace', {
        href: new_url,
        title: t('title_with_page', {
          title: res.section.title,
          page: res.page.current
        })
      });

      callback();
    });

    return;
  });
});


/////////////////////////////////////////////////////////////////////
// Update navbar when user scrolls the page
//
N.wire.on('navigate.done:' + module.apiPath, function scroll_tracker_init() {
  var $window = $(window);

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
  }, 100, { maxWait: 100 });

  $(window).on('scroll', scrollHandler);
});

N.wire.on('navigate.exit:' + module.apiPath, function scroll_tracker_teardown() {
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
        current:  sectionState.page,
        max:      sectionState.max_page
      }
    }));

  var viewportStart = $(window).scrollTop() + navbarHeight;

  // If we scroll below top border of the first post,
  // show the secondary navbar
  //
  if ($('.forum-topiclist').offset().top < viewportStart) {
    $('.navbar').addClass('navbar__m-secondary');
  } else {
    $('.navbar').removeClass('navbar__m-secondary');
  }
});

N.wire.on('navigate.exit:' + module.apiPath, function navbar_teardown() {
  $('.navbar-alt').empty();
  $('.navbar').removeClass('navbar__m-secondary');
});
