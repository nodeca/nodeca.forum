// Update progress bar
//

'use strict';


N.wire.on(module.apiPath + ':update', function update_progress(data) {
  var current     = data.current,
      total       = data.max;

  if (typeof current === 'undefined' || current === null) {
    current = $('.page-progress').data('current');
  }

  if (typeof total === 'undefined' || total === null) {
    total = $('.page-progress').data('total');
  }

  // ensure that current is in [1..total] range, except for 0/0
  current = total > 0 ? Math.max(1, Math.min(current, total)) : 0;

  $('.page-progress__label-current').text(current);
  $('.page-progress__label-total').text(total);

  $('.page-progress__bar-fill').css({
    width: (current / total * 100).toFixed(2) + '%'
  });

  $('.page-progress').data('current', current).data('total', total);
});
