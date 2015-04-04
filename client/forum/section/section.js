'use strict';


N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  ////////////////////////////////////////////////////////////////////////////////
  // "More topics" button logic

  N.wire.on('forum.section.append_next_page', function append_next_page(data, callback) {
    var $button = data.$this;
    var new_url = $button.attr('href');
    var params = { section_hid: $button.data('section'), page: $button.data('page') };

    N.io.rpc('forum.section.list.by_page', params).done(function (res) {

      // if no topics - just disable 'More' button
      if (!res.topics || !res.topics.length) {
        N.wire.emit('notify', {
          type: 'warning',
          message: t('error_no_more_topics')
        });
        $button.addClass('hidden');

        callback();
        return;
      }

      res.show_page_number = res.page.current;

      // render & inject topics list
      var $result = $(N.runtime.render('forum.blocks.topics_list', res));
      $('#topiclist > :last').after($result);

      // update button data & state
      $button.data('page', res.page.current + 1);

      $button.attr('href', N.router.linkTo('forum.section', {
        hid:          res.section.hid,
        page:         res.page.current + 1
      }));

      if (res.page.current === res.page.max) {
        $button.addClass('hidden');
      }

      // update pager
      $('._pagination').html(
        N.runtime.render('common.blocks.pagination', {
          route:    'forum.section',
          params:   { hid: res.section.hid },
          current:  res.page.current,
          max: res.page.max
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

      callback();
    });

    return;
  });
});
