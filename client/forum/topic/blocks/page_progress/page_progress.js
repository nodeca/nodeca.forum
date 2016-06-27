// Update progress bar
//

'use strict';


N.wire.on(module.apiPath + ':update', function update_progress(data) {
  var current     = data.current,
      total       = data.max,
      section_hid = $('.page-progress').data('section'),
      topic_hid   = $('.page-progress').data('topic');

  if (!current) {
    current = $('.page-progress').data('current');
  }

  if (!total) {
    total = $('.page-progress').data('total');
  }

  // ensure that current is in [1..total] range
  current = Math.max(1, Math.min(current, total));

  $('.page-progress__label-current').text(current);
  $('.page-progress__label-total').text(total);

  $('.page-progress__bar-fill').css({
    width: (current / total * 100).toFixed(2) + '%'
  });

  $('.page-progress__jump-input').attr('max', total);

  if (!$('.page-progress .dropdown').hasClass('open')) {
    $('.page-progress__jump-input').attr('value', current);
  }

  $('.page-progress__button-last').attr('href', N.router.linkTo('forum.topic', {
    section_hid,
    topic_hid,
    post_hid: total
  }));

  $('.page-progress').data('current', current).data('total', total);
});
