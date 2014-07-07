// Forum Topic page logic
//

'use strict';

// Topic state
//
// - topic_hid:             topic's human id
// - section_hid:     id of the current section
// - page:            topic's next page
//
var topicState = {};

// init on page load and destroy editor on window unload
//
N.wire.on('navigate.done:forum.topic', function (data) {
  topicState.topic_hid = +data.params.hid;
  topicState.section_hid = +data.params.section_hid;
  topicState.page = +data.params.page;
});

// "More posts" button logic
//
N.wire.on('forum.topic.append_next_page', function (event) {
  var $button = $(event.currentTarget);

  // request for the next page
  N.io.rpc(
    'forum.topic.list',
    { hid: topicState.topic_hid, page: topicState.page + 1 },
    function (err, res) {

      // Process errors
      if (err) {
        // Do redirect, if happened
        if (err.code === N.io.REDIRECT) {
          N.wire.emit('navigate.to', err.head.Location);
          return;
        }
        // Notify user in other case
        N.wire.emit('io.error', err);
      }

      // if no posts - just disable 'More' button
      if (!res.posts || !res.posts.length) {
        N.wire.emit('notify', {
          type: 'warning',
          message: t('error_no_more_posts')
        });
        $button.addClass('hidden');
        return;
      }

      res.show_page_number = res.page.current;

      // render & inject posts list
      var $result = $(N.runtime.render('forum.blocks.posts_list', res));
      $('#postlist > :last').after($result);

      // store current url to replace it in browser
      var currentUrl = $button.attr('href');

      // update button href with next page URL
      $button.attr('href', N.runtime.router.linkTo('forum.topic', {
        hid:          res.topic.hid,
        section_hid:  res.section.hid,
        page:         res.page.current + 1
      }));

      // hide button if max page is reached
      if (res.page.current === res.page.max) {
        $button.addClass('hidden');
      }

      // update pager
      $('._pagination').html(
        N.runtime.render('common.blocks.pagination', {
          route:    'forum.topic'
        , params:   { hid: res.topic.hid, section_hid: res.section.hid }
        , current:  res.page.current
        , max: res.page.max
        })
      );

      // update history / url / title
      N.wire.emit('navigate.replace', {
        href: currentUrl,
        title: t('title_with_page', {
          title: res.topic.title,
          page: res.page.current
        })
      });

      // update topic state
      topicState.page = res.page.current;
    }
  );
});
