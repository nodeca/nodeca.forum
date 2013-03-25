'use strict';


/*global N, window*/


var $ = window.jQuery;
var injectStats = require('nodeca.core/client/common/_inject_stats');


N.wire.on(module.apiPath, function (event) {
  var $el     = $(event.currentTarget)
    , current = parseInt($el.data('current-page'), 10)
    , params  = {};

  params.page = current + 1;
  params.id   = $el.data('forum-id');

  N.io.rpc('forum.section', params, function (err, payload) {
    if (err) {
      // common case:
      // - amount of pages reduced (some threads were moved or deleted)
      window.location = $el.attr('href');
      return;
    }

    // set current page to the one that was loaded
    $el.data('current-page', payload.data.page.current);
    payload.data.show_page_number = payload.data.page.current;

    // Update current state in the history
    N.wire.emit('history.update', { payload: payload, url: $el.attr('href') });

    if (payload.data.page.current === payload.data.page.max) {
      $el.addClass('hidden');
    } else {
      $el.attr('href', N.runtime.router.linkTo(payload.data.head.apiPath, {
        id:   payload.data.forum.id,
        page: payload.data.page.current + 1
      }));
    }

    var $html = $(N.runtime.render('forum.blocks.threads_list', payload.data));
    $('.tl-thread-list:last').after($html.hide());

    // update pager
    $('.pagination').replaceWith(
      N.runtime.render('common.blocks.pagination', {
        route:    'forum.section',
        params:   payload.data.forum,
        current:  payload.data.page.current,
        max_page: payload.data.page.max
      })
    );

    // show content
    $html.fadeIn();

    // inject debug stats if needed/possible
    injectStats(payload.data);
  });
});
