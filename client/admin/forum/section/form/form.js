'use strict';


const _  = require('lodash');
const ko = require('knockout');


const SECTION_FIELD_DEFAULTS = {
  title:          '',
  description:    '',
  parent:         null,
  is_category:    false,
  is_enabled:     true,
  is_writable:    true,
  is_searchable:  true,
  is_votable:     true,
  is_counted:     true,
  is_excludable:  true
};


// Knockout bindings root object.
let view = null;


N.wire.on(module.apiPath + '.setup', function page_setup(data) {
  let isNewSection   = !data.current_section,
      currentSection = {};

  // Create observable fields on currentSection.
  for (let [ key, defaultValue ] of Object.entries(SECTION_FIELD_DEFAULTS)) {
    let value = Object.prototype.hasOwnProperty.call(data.current_section || {}, key) ?
                data.current_section[key] :
                defaultValue;

    currentSection[key] = ko.observable(value).extend({ dirty: isNewSection });
  }


  // Collect allowedParents list using tree order.
  // Prepand "– " string to title of each sections depending on nesting level.
  let allowedParents = [];

  // Prepend virtual Null-section to allowedParents list.
  // This is used instead of Knockout's optionsCaption because it does not
  // allow custom values - null in our case.
  allowedParents.push({ _id: null, title: t('value_section_none') });

  function fetchOtherSections(parent) {
    let sections = data.allowed_parents.filter(section => parent === (section.parent || null));

    _.sortBy(sections, 'display_order').forEach(section => {
      let prefix = '| ' + '– '.repeat(section.level);

      allowedParents.push({
        _id:   section._id,
        title: prefix + section.title
      });

      fetchOtherSections(section._id); // Fetch children sections.
    });
  }
  fetchOtherSections(null); // Fetch root sections.


  // Create and fill Knockout binding.
  view = {};

  view.isNewSection   = isNewSection;
  view.currentSection = currentSection;
  view.allowedParents = allowedParents;

  // "Copy settings from" special field.
  view.copySettingsFrom = ko.observable(null);
  view.copySettingsFrom.subscribe(selectedSourceId => {
    if (!selectedSourceId) {
      // Reset field values to defaults.
      for (let [ key, field ] of Object.entries(currentSection)) {
        if (Object.prototype.hasOwnProperty.call(SECTION_FIELD_DEFAULTS, key)) {
          field(SECTION_FIELD_DEFAULTS[key]);
        }
      }
      return;
    }

    let selectedSourceSection = data.allowed_parents.find(s => s._id === selectedSourceId);

    if (!selectedSourceSection) {
      N.logger.error('Cannot find section %j in page data.', selectedSourceId);
      return;
    }

    // Copy field values.
    for (let [ key, field ] of Object.entries(currentSection)) {
      if (Object.prototype.hasOwnProperty.call(selectedSourceSection, key)) {
        field(selectedSourceSection[key]);
      }
    }
  });

  // Check if any field values of currentSection were changed.
  view.isDirty = ko.computed(() => Object.values(currentSection).some(field => field.isDirty()));

  // Save new section.
  view.create = function create() {
    let request = {};

    for (let [ key, field ] of Object.entries(currentSection)) {
      request[key] = field();
    }

    N.io.rpc('admin.forum.section.create', request).then(() => {
      for (let field of Object.values(currentSection)) field.markClean();

      N.wire.emit('notify.info', t('message_created'));
      return N.wire.emit('navigate.to', { apiPath: 'admin.forum.section.index' });
    }).catch(err => N.wire.emit('error', err));
  };

  // Save actually existent currentSection.
  view.update = function update() {
    let request = { _id: data.current_section._id };

    for (let [ key, field ] of Object.entries(currentSection)) {
      request[key] = field();
    }

    N.io.rpc('admin.forum.section.update', request).then(function () {
      for (let field of Object.values(currentSection)) field.markClean();

      N.wire.emit('notify.info', t('message_updated'));
    }).catch(err => N.wire.emit('error', err));
  };

  ko.applyBindings(view, $('#content')[0]);
});


N.wire.on(module.apiPath + '.teardown', function page_teardown() {
  view = null;
  ko.cleanNode($('#content')[0]);
});
