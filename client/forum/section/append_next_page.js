'use strict';


/*global nodeca, $*/


function updatePager(params, page) {
  $('.pagination').replaceWith(
    nodeca.client.common.render.template('common.pagination', {
      route:    'forum.thread',
      params:   { id: params.id },
      current:  page.current,
      max:      page.max
    })
  );
}


module.exports = function ($el) {
  var current = parseInt($el.data('current-page'), 10),
      params  = {};

  params.page = current + 1;
  params.id   = $el.data('forum-id');

  nodeca.server.forum.section(params, function (err, payload) {
    if (err) {
      nodeca.logger.error(err);

      if (nodeca.io.REDIRECT === err.code) {
        // redirect can cause only one case - last page was removed
        // between requests (last and current one)
        updatePager(params, { current: current, max: current });
        $el.addClass('hidden');
      }

      return;
    }

    // set current page to the one that was loaded
    $el.data('current-page', payload.data.page.current);
    payload.data.show_page_number = payload.data.page.current;

    // Update current state in the history
    nodeca.client.common.history.updateState(payload, $el.attr('href'));

    if (payload.data.page.current === payload.data.page.max) {
      $el.addClass('hidden');
    } else {
      $el.attr('href', nodeca.runtime.router.linkTo(payload.data.head.apiPath, {
        id:   payload.data.forum.id,
        page: payload.data.page.current + 1
      }));
    }

    var $html = $(nodeca.client.common.render.template('forum.partials.threads_list', payload.data));
    $('.tl-thread-list:last').after($html.hide());

    // update pager
    updatePager(payload.data.forum, payload.data.page);

    // show content
    $html.fadeIn();

    // inject debug stats if needed/possible
    nodeca.client.common.stats.inject(payload.data);
  });

  return false;
};
