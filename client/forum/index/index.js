'use strict';


const _ = require('lodash');


// Scroll to the element, so it would be positioned in the viewport
//
//  - el    - Element to scroll
//  - ratio - 0...1 offset (1..100%) of element center from viewport top
//            e.g. 0.5 means it should position element to the middle of the screen
//
function scrollIntoView(el, coef) {
  // 1. The top line of the element should always be lower than navbar
  // 2. The middle line of the element should be located at coef*viewport_height (if possible)
  //
  var el_top = el.offset().top;
  var el_h   = el.height();
  var win_h  = $(window).height();
  var nav_h  = $('.navbar').height();

  $(window).scrollTop(Math.min(
    el_top - nav_h,
    (el_top + el_h / 2) - nav_h - (win_h - nav_h) * coef
  ));
}


/////////////////////////////////////////////////////////////////////
// init on page load
//
N.wire.on('navigate.done:' + module.apiPath, function page_setup(data) {
  var anchor = data.anchor || '';

  if (anchor.match(/^#cat\d+$/)) {
    var el = $('.forum-section' + anchor);

    if (el.length) {
      // override automatic scroll to an anchor in the navigator
      data.no_scroll = true;

      // It's a section (user clicks on a levelup button in it), so it
      // should be positioned 30% from top of the screen and highlighed,
      // so user could see where exactly did she navigate from.
      //
      scrollIntoView(el, 0.3);
      el.addClass('forum-section__m-highlight');

      return;
    }
  }
});


N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  // Exclude click
  //
  N.wire.on(module.apiPath + ':exclude', function exclude() {
    let params = {};

    return Promise.resolve()
      .then(() => N.io.rpc('forum.index.exclude.sections', {}))
      .then(res => {
        _.assign(params, res);
        return N.wire.emit('forum.index.sections_exclude_dlg', params);
      })
      .then(() => N.io.rpc('forum.index.exclude.update', { sections_ids: params.selected }))
      .then(() => N.wire.emit('navigate.reload'));
  });
});
