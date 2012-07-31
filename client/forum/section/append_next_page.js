'use strict';


module.exports = function ($el, event) {
  var current = ~~$el.data('current-page'),
      max     = ~~$el.data('max-page'),
      params  = {};

  event.preventDefault();

  params.page = current + 1;
  params.id   = $el.data('forum-id');

  if (params.page <= max) {
    // set current page to the one that was loaded
    nodeca.server.forum.section(params, function (err, payload) {
      if (err) {
        nodeca.logger.error(err);
        return;
      }

      $el.data('current-page', params.page);
      payload.data.show_page_number = params.page;

      if (params.page === max) {
        $el.addClass('disabled');
      }

      var html = nodeca.client.common.render('forum.section_threads', '', payload.data);
      $('ul.tl-thread-list:last').after(html);
    });
  }

  return false;
};
