'use strict';


////////////////////////////////////////////////////////////////////////////////
// "More topics" button logic

N.wire.on('forum.section.append_next_page', function (event) {
  var $button = $(event.currentTarget);
  var new_url = $button.attr('href');

  N.io.rpc(
    'forum.section.list',
    { hid: $button.data('section'), page: $button.data('page') },
    function (err, res) {

      // Process errors
      if (err) {
        // Do redirect, if happened
        if (err.code === N.io.REDIRECT) {
          N.wire.emit('navigate.to', err.head.Location);
          return;
        }
        // Notify user in other case
        return false;
      }

      // if no topics - just disable 'More' button
      if (!res.topics || !res.topics.length) {
        N.wire.emit('notify', {
          type: 'warning',
          message: t('error_no_more_topics')
        });
        $button.addClass('hidden');
        return;
      }

      res.show_page_number = res.page.current;

      // render & inject topics list
      var $result = $(N.runtime.render('forum.blocks.topics_list', res));
      $('#topiclist > :last').after($result);

      // update button data & state
      $button.data('page', res.page.current + 1);

      $button.attr('href', N.runtime.router.linkTo('forum.section', {
        hid:          res.section.hid,
        page:         res.page.current + 1
      }));

      if (res.page.current === res.page.max) {
        $button.addClass('hidden');
      }

      // update pager
      $('._pagination').html(
        N.runtime.render('common.blocks.pagination', {
          route:    'forum.section'
        , params:   { hid: res.section.hid }
        , current:  res.page.current
        , max: res.page.max
        })
      );

      // update history / url / title
      N.wire.emit('navigate.replace', {
        href: new_url,
        title: t('title_with_page', {
          title: res.section.title,
          page: res.page.current
        })
      });
    }
  );

  return;
});
