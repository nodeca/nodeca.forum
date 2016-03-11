// Popup dialog to exclude sections
//
// - sections ([Object]) - sections tree
// - selected ([String]) - already excluded sections
//
'use strict';


const _ = require('lodash');


let $dialog;
let params;
let result;


N.wire.once(module.apiPath, function init_handlers() {

  // Submit button handler
  //
  N.wire.on(module.apiPath + ':submit', function submit_sections_exclude_dlg() {
    let selected = [];

    _.forEach($('.sections-exclude-dlg__section:selected'), el => {
      selected.push($(el).val());
    });

    params.selected = selected;

    result = params;
    $dialog.modal('hide');
  });


  // Find section by _id in tree
  //
  function findRecursive(_id, sections) {
    if (!sections) sections = params.sections;

    for (var i = 0; i < sections.length; i++) {
      if (sections[i]._id === _id) return sections[i];

      let result = findRecursive(_id, sections[i].children || []);

      if (result) return result;
    }

    return null;
  }


  // Get list of children sections _ids
  //
  function childrenList(section) {
    let result = _.map(section.children || [], '_id');

    for (var i = 0; i < (section.children || []).length; i++) {
      result = result.concat(childrenList(section.children[i]));
    }

    return result;
  }


  // Sections list change
  //
  N.wire.on(module.apiPath + ':change', function sections_change_sections_exclude_dlg(data) {
    let selected = data.$this.val() || [];

    selected.forEach(section_id => {
      let children_ids = childrenList(findRecursive(section_id));

      children_ids.forEach(child_id => {
        let $el = $(`.sections-exclude-dlg__section[value="${child_id}"]`);

        if (!$el.is(':disabled')) $el.prop('selected', true);
      });
    });
  });


  // Close dialog on sudden page exit (if user click back button in browser)
  //
  N.wire.on('navigate.exit', function teardown_page() {
    if ($dialog) {
      $dialog.modal('hide');
    }
  });
});


// Init dialog
//
N.wire.on(module.apiPath, function show_sections_exclude_dlg(options) {
  params = options;
  $dialog = $(N.runtime.render(module.apiPath, _.assign({ apiPath: module.apiPath }, params)));

  $('body').append($dialog);

  return new Promise((resolve, reject) => {
    $dialog
      .on('shown.bs.modal', () => {
        $dialog.find('.btn-default').focus();
      })
      .on('hidden.bs.modal', () => {
        // When dialog closes - remove it from body and free resources
        $dialog.remove();
        $dialog = null;
        params = null;

        if (result) resolve();
        else reject('CANCELED');

        result = null;
      })
      .modal('show');
  });
});
