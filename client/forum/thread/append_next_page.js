'use strict';


module.exports = function ($el, event) {
  var current = ~~$el.data('current-page'),
      max     = ~~$el.data('max-page'),
      params  = {};

  params.page     = current + 1;
  params.id       = $el.data('thread-id');
  params.forum_id = $el.data('forum-id');

  if (params.page <= max) {
    // set current page to the one that was loaded
    nodeca.server.forum.thread(params, function (err, payload) {
      if (err) {
        nodeca.logger.error(err);
        return;
      }

      $el.data('current-page', params.page);
      payload.data.show_page_number = params.page;

      if (params.page === max) {
        $el.addClass('hidden');
      }

      var $html = $(nodeca.client.common.render('forum.thread_posts', '', payload.data));
      $('article.forum-post:last').after($html.hide());
      $html.fadeIn();
    });
  }

  return false;
};
