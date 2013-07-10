'use strict';


N.wire.on('forum.section.append_next_page', function (event) {
  var $button = $(event.currentTarget);

  function renderNextPage(data, callback) {
    var $result, locals = data.locals;

    locals.show_page_number = locals.page.current;

    // Hide "More threads" button if there are no more pages.
    // Or update the button's link to the next page.
    if (locals.page.current === locals.page.max) {
      $button.addClass('hidden');
    } else {
      $button.attr('href', N.runtime.router.linkTo('forum.section', {
        id:   locals.forum.id,
        page: locals.page.current + 1
      }));
    }

    $result = $(N.runtime.render('forum.blocks.threads_list', locals)).hide();
    $('#topiclist > :last').after($result);

    // update pager
    $('._pagination').html(
      N.runtime.render('common.blocks.pagination', {
        route:    'forum.section',
        params:   locals.forum,
        current:  locals.page.current,
        max_page: locals.page.max
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
