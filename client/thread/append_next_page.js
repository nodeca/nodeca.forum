'use strict';


module.exports = function ($el, event) {
  var current = ~~$el.data('current-page'),
      max     = ~~$el.data('max-page'),
      params  = {};

  event.preventDefault();

  params.page     = current + 1;
  params.id       = $el.data('thread-id');
  params.forum_id = $el.data('forum-id');

  if (params.page < max) {
    // set current page to the one that was loaded
    nodeca.server.forum.thread(params, function (err, data) {
      if (err) {
        nodeca.logger.error(err);
        return;
      }

      $el.data('current-page', params.page);

      if (params.page === max) {
        $el.addClass('disabled');
      }

      nodeca.logger.info('Not finished yet', data);
    });
  }

  return false;
};
