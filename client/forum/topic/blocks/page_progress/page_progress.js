// Update progress bar
//

'use strict';


N.wire.on(module.apiPath + ':update', function update_progress(data) {
  var current = data.current,
      total   = data.max;

  // ensure that current is in [1..total] range
  current = Math.max(1, Math.min(current, total));

  $('.page-progress__label').text(
    N.runtime.t(module.apiPath + '.label', { current: current, total: total })
  );

  $('.page-progress__graph-percentage').css({
    width: (current / total * 100).toFixed(2) + '%'
  });
});
