'use strict';


/*global window, nodeca, $*/


module.exports = function ($el, event) {
  var current = parseInt($el.data('current-page'), 10),
      params  = {};

  params.page     = current + 1;
  params.id       = $el.data('thread-id');
  params.forum_id = $el.data('forum-id');

  nodeca.server.forum.thread(params, function (err, payload) {
    if (err) {
      nodeca.logger.error(err);
      return;
    }

    // set current page to the one that was loaded
    $el.data('current-page', payload.data.page.current);
    payload.data.show_page_number = payload.data.page.current;

    // Update current state in the history
    nodeca.client.common.history.updateStateURL($el.attr('href'));

    if (payload.data.page.current === payload.data.page.max) {
      $el.addClass('hidden');
    } else {
      $el.attr('href', nodeca.runtime.router.linkTo(payload.data.head.apiPath, {
        id:       payload.data.thread.id,
        forum_id: payload.data.thread.forum_id,
        page:     payload.data.page.current + 1
      }));
    }

    var $html = $(nodeca.client.common.render('forum.partials.posts_list', payload.data));
    $('.forum-post:last').after($html.hide());

    // update pager
    $('.pagination').replaceWith(
      nodeca.client.common.render('common.widgets.partials.pagination', {
        route:    'forum.thread',
        params:   {
          id:       payload.data.thread.id,
          forum_id: payload.data.thread.forum_id
        },
        current:  payload.data.page.current,
        max:      payload.data.page.max
      })
    );

    // show content
    $html.fadeIn();

    // inject debug stats if needed/possible
    nodeca.client.common.stats.inject(payload.data);
  });

  return false;
};
