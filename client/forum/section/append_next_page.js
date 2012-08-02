'use strict';


/*global window, nodeca, $*/


module.exports = function ($el, event) {
  var current = ~~$el.data('current-page'),
      params  = {};

  params.page = current + 1;
  params.id   = $el.data('forum-id');

  nodeca.server.forum.section(params, function (err, payload) {
    if (err) {
      nodeca.logger.error(err);
      return;
    }

    // set current page to the one that was loaded
    $el.data('current-page', payload.data.page.current);
    payload.data.show_page_number = payload.data.page.current;

    if (payload.data.page.current === payload.data.page.max) {
      $el.addClass('hidden');
    } else {
      $el.attr('href', nodeca.runtime.router.linkTo(payload.data.head.apiPath, {
        id:   payload.data.forum.id,
        page: payload.data.page.current + 1
      }));
    }

    var $html = $(nodeca.client.common.render('forum.partials.threads_list', '', payload.data));
    $('.tl-thread-list:last').after($html.hide());
    $html.fadeIn();
  });

  return false;
};
