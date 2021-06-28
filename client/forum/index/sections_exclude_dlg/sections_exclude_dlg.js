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

    $('.sections-exclude-dlg__section:selected').each((idx, el) => {
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
    let result = (section.children || []).map(s => s._id);

    for (var i = 0; i < (section.children || []).length; i++) {
      result = result.concat(childrenList(section.children[i]));
    }

    return result;
  }


  // Get list of parent sections _ids
  //
  function parentsList(_id, sections) {
    if (!sections) sections = params.sections;

    for (var i = 0; i < sections.length; i++) {
      if (sections[i]._id === _id) return [];

      let child_result = parentsList(_id, sections[i].children || []);

      if (child_result) {
        return [ sections[i]._id ].concat(child_result);
      }
    }

    return null;
  }


  // Unselect all
  //
  N.wire.on(module.apiPath + ':unselect_all', function unselect_all_sections_exclude_dlg() {
    $('.sections-exclude-dlg__section:selected').each((idx, el) => {
      $(el).prop('selected', false);
    });
  });


  // Sections list change
  //
  N.wire.on(module.apiPath + ':section_click', function section_click_sections_exclude_dlg(data) {

    // Unselect all parent items if user unselect child
    //
    if (!data.$this.prop('selected')) {
      let parents_ids = parentsList(data.$this.val());

      parents_ids.forEach(parent_id => {
        $(`.sections-exclude-dlg__section[value="${parent_id}"]`).prop('selected', false);
      });

      return;
    }


    // Select all children items if user select parent
    //
    let selected = [];

    $('.sections-exclude-dlg__section:selected').each((idx, el) => {
      selected.push($(el).val());
    });

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


let resizeDialog = _.throttle(function () {
  if (!$dialog) return;

  let $sections = $dialog.find('.sections-exclude-dlg__sections');
  let dlg_only_height = $dialog.find('.modal-dialog').outerHeight(true) - $sections.height();
  let new_sections_height = $(window).height() - dlg_only_height;

  if (new_sections_height <= $sections.css('min-height')) new_sections_height = $sections.css('min-height');

  $sections.height(new_sections_height);
}, 100);


// Init dialog
//
N.wire.on(module.apiPath, function show_sections_exclude_dlg(options) {
  let $window = $(window);
  params = options;
  $dialog = $(N.runtime.render(module.apiPath, Object.assign({ apiPath: module.apiPath }, params)));

  $('body').append($dialog);

  return new Promise((resolve, reject) => {
    $dialog
      .on('shown.bs.modal', () => {
        resizeDialog();
        $window.on('resize', resizeDialog);
        $dialog.find('.btn-secondary').focus();
      })
      .on('hidden.bs.modal', () => {
        // When dialog closes - remove it from body and free resources
        $window.off('resize', resizeDialog);
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
