// Update progress bar
//

'use strict';


N.wire.on(module.apiPath + ':update', function update_progress(data) {
  var current     = data.current,
      total       = data.max,
      section_hid = $('.page-progress').data('section');

  if (!current) {
    current = $('.page-progress').data('current');
  }

  if (!total) {
    total = $('.page-progress').data('total');
  }

  // ensure that current is in [1..total] range
  current = Math.max(1, Math.min(current, total));

  $('.page-progress__label').text(
    N.runtime.t(module.apiPath + '.label', { current: current, total: total })
  );

  $('.page-progress__bar').css({
    width: (current / total * 100).toFixed(2) + '%'
  });

  $('.page-progress__jump-input').attr('max', total);

  if (!$('.page-progress__dropdown').hasClass('open')) {
    $('.page-progress__jump-input').attr('value', current);
  }

  $('.page-progress__button-last').attr('href', N.router.linkTo('forum.section', {
    hid:  section_hid,
    page: total
  }));

  $('.page-progress').data('current', current).data('total', total);
});
