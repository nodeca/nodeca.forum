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
    }

    var $html = $(nodeca.client.common.render('forum.section_threads', '', payload.data));
    $('ul.tl-thread-list:last').after($html.hide());
    $html.fadeIn();
  });

  return false;
};
