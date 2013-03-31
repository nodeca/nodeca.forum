'use strict';


var _ = require('lodash');


N.wire.on('forum.thread.append_next_page', function (event) {
  var $button = $(event.currentTarget)
    , href    = $button.attr('href');

  N.wire.emit('navigate.to', { href: href, replaceState: true, skipRender: true }, function (err) {
    if (err) {
      // common case:
      // - amount of pages reduced (some posts were removed)
      // - thread was moved or deleted
      window.location = href;
      return;
    }

    // Get new history state directly from window.History because we cannot
    // receive it from 'navigate.to' event handler - Wire does not provide
    // such ability.
    var state  = window.History.getState()
      , data   = state.data
      , locals = _.clone(data.locals);

    locals.show_page_number = data.locals.page.current;

    // Hide "More posts" button if there are no more pages.
    // Or update the button's link to the next page.
    if (data.locals.page.current === data.locals.page.max) {
      $button.addClass('hidden');
    } else {
      $button.attr('href', N.runtime.router.linkTo(locals.head.apiPath, {
        id:       locals.thread.id,
        forum_id: locals.thread.forum_id,
        page:     locals.page.current + 1
      }));
    }

    var $html = $(N.runtime.render('forum.blocks.posts_list', locals));
    $('.forum-post:last').after($html.hide());

    // update pager
    $('.pagination').replaceWith(
      N.runtime.render('common.blocks.pagination', {
        route:    'forum.thread',
        params:   locals.thread,
        current:  locals.page.current,
        max_page: locals.page.max
      })
    );

    // show content
    $html.fadeIn();
  });
});
