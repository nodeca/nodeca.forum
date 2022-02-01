'use strict';

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
const bkv = require('bkv').create();
let collapsed_categories;

// 'hide.bs.collapse' event handler, stores category state
function on_category_collapse_hide(event) {
  let store_key = `forum_index_collapse_${N.runtime.user_hid}`;
  let hid = $(event.target).data('category-hid');

  collapsed_categories[hid] = true;
  bkv.set(store_key, collapsed_categories);
}

// 'show.bs.collapse' event handler, stores category state
function on_category_collapse_show(event) {
  let store_key = `forum_index_collapse_${N.runtime.user_hid}`;
  let hid = $(event.target).data('category-hid');

  delete collapsed_categories[hid];
  bkv.set(store_key, collapsed_categories);
}

N.wire.on('navigate.done:' + module.apiPath, async function restore_category_collapse_state() {
  let store_key = `forum_index_collapse_${N.runtime.user_hid}`;

  // Collapse categories that were previously collapsed on last page load

  collapsed_categories = await bkv.get(store_key, {});

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

N.wire.on('navigate.exit:' + module.apiPath, function remove_collapse_handlers() {
  $('.forum-category__content')
    .off('hide.bs.collapse', on_category_collapse_hide)
    .off('show.bs.collapse', on_category_collapse_show);
});


N.wire.on('navigate.done:' + module.apiPath, function scroll_to_anchor(data) {
  let anchor = data.anchor || '';

  if (anchor.match(/^#cat\d+$/)) {
    let el = $('.forum-section' + anchor);

    if (el.length) {
      // override automatic scroll to an anchor in the navigator
      data.no_scroll = true;

      // It's a section (user clicks on a levelup button in it), so it
      // should be positioned 30% from top of the screen and highlighed,
      // so user could see where exactly did she navigate from.
      //
      scrollIntoView(el, 0.3);
      el.addClass('forum-section__m-highlight');

      // Undo category collapse above
      //
      let hid = el.closest('.forum-category__content').data('category-hid');

      if ($(`#cat_box_${Number(hid)}`).hasClass('collapsed')) {
        // - manually toggle classes to avoid triggering bootstrap animation
        // - set temporary class to disable opacity transitions
        $(`#cat_box_${Number(hid)}`).addClass('no-animation').removeClass('collapsed');
        $(`#cat_list_${Number(hid)}`).addClass('show');
        // remove transitions blocker on next tick
        setTimeout(() => {
          $(`#cat_box_${Number(hid)}`).removeClass('no-animation');
        }, 0);
      }

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
        Object.assign(params, res);
        return N.wire.emit('forum.index.sections_exclude_dlg', params);
      })
      .then(() => N.io.rpc('forum.index.exclude.update', { sections_ids: params.selected }))
      .then(() => N.wire.emit('navigate.reload'));
  });
});
