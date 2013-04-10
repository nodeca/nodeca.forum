'use strict';


N.wire.on('forum.thread.append_next_page', function (event) {
  var $button = $(event.currentTarget);

  function renderNextPage(data, callback) {
    var $result, locals = data.locals;

    locals.show_page_number = locals.page.current;

    // Hide "More posts" button if there are no more pages.
    // Or update the button's link to the next page.
    if (locals.page.current === locals.page.max) {
      $button.addClass('hidden');
    } else {
      $button.attr('href', N.runtime.router.linkTo('forum.thread', {
        id:       locals.thread.id
      , forum_id: locals.thread.forum_id
      , page:     locals.page.current + 1
      }));
    }

    $result = $(N.runtime.render('forum.blocks.posts_list', locals)).hide();
    $('.forum-post:last').after($result);

    // update pager
    $('.pagination').replaceWith(
      N.runtime.render('common.blocks.pagination', {
        route:    'forum.thread'
      , params:   locals.thread
      , current:  locals.page.current
      , max_page: locals.page.max
      })
    );

    // show content
    $result.fadeIn();
    callback();
  }

  N.wire.emit('navigate.to', {
    href: $button.attr('href')
  , render: renderNextPage
  , replaceState: true
  });
});
