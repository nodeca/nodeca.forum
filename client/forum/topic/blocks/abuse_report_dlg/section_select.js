'use strict';

N.wire.on(module.apiPath + ':render', function render(data) {
  return N.io.rpc('forum.topic.post.abuse_report.sections', {
    section_hid: data.params.current_section
  }).then(res => {
    data.html = N.runtime.render(module.apiPath, {
      message: data.message.text,
      sections: res.sections,
      current_section_hid: data.params.current_section
    });
  });
});

N.wire.on(module.apiPath + ':submit', function submit(data) {
  data.move_to = +$('.abuse-report-dlg__forum-section-select').val();
});
