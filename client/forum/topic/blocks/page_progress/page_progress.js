// Update progress bar
//

'use strict';


N.wire.on(module.apiPath + ':update', function update_progress(data) {
  $('.page-progress__label').text(
    N.runtime.t(module.apiPath + '.label', { current: data.current, total: data.max })
  );

  $('.page-progress__graph-percentage').css({
    width: (data.current / data.max * 100).toFixed(2) + '%'
  });
});
