'use strict';


const _    = require('lodash');
const _bag = require('bagjs');


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
let bag;
let collapsed_categories;

N.wire.once('navigate.done:' + module.apiPath, function init_bagjs() {
  bag = _bag({ prefix: 'nodeca', stores: [ 'localstorage' ] });
});

// 'hide.bs.collapse' event handler, stores category state in bag.js
function on_category_collapse_hide(event) {
  let bag_key = `forum_index_collapse_${N.runtime.user_hid}`;
  let hid = $(event.target).data('category-hid');

  collapsed_categories[hid] = true;
  bag.set(bag_key, collapsed_categories).catch(() => {});
}

// 'show.bs.collapse' event handler, stores category state in bag.js
function on_category_collapse_show(event) {
  let bag_key = `forum_index_collapse_${N.runtime.user_hid}`;
  let hid = $(event.target).data('category-hid');

  delete collapsed_categories[hid];
  bag.set(bag_key, collapsed_categories).catch(() => {});
}

N.wire.on('navigate.done:' + module.apiPath, function restore_category_collapse_state() {
  let bag_key = `forum_index_collapse_${N.runtime.user_hid}`;

  return bag.get(bag_key).catch(() => {}).then(c => {
    // Collapse categories that were previously collapsed on last page load
    //
    collapsed_categories = c || {};

    for (let hid of Object.keys(collapsed_categories)) {
      // - manually toggle classes to avoid triggering bootstrap animation
      // - set temporary class to disable opacity transitions
      $(`#cat_box_${Number(hid)}`).addClass('collapsed no-animation');
      $(`#cat_list_${Number(hid)}`).removeClass('show');
      // remove transitions blocker on next tick
      setTimeout(() => {
        $(`#cat_box_${Number(hid)}`).removeClass('no-animation');
      }, 0);
    }

    // Remember collapse state when user clicks on a category
    //
    $('.forum-category__content')
      .on('hide.bs.collapse', on_category_collapse_hide)
      .on('show.bs.collapse', on_category_collapse_show);
  });
});

N.wire.on('navigate.exit:' + module.apiPath, function remove_collapse_handlers() {
  $('.forum-category__content')
    .off('hide.bs.collapse', on_category_collapse_hide)
    .off('show.bs.collapse', on_category_collapse_show);
});


N.wire.on('navigate.done:' + module.apiPath, function scroll_to_anchor(data) {
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
