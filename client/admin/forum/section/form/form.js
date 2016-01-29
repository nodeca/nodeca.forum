'use strict';


var _  = require('lodash');
var ko = require('knockout');


var SECTION_FIELD_DEFAULTS = {
  title:          '',
  description:    '',
  parent:         null,
  is_category:    false,
  is_enabled:     true,
  is_writeble:    true,
  is_searcheable: true,
  is_voteable:    true,
  is_counted:     true,
  is_excludable:  true
};


// Knockout bindings root object.
var view = null;


N.wire.on(module.apiPath + '.setup', function page_setup(data) {
  var isNewSection   = !data.current_section,
      currentSection = {};

  // Create observable fields on currentSection.
  _.forEach(SECTION_FIELD_DEFAULTS, function (defaultValue, key) {
    var value = _.has(data.current_section, key) ? data.current_section[key] : defaultValue;

    currentSection[key] = ko.observable(value).extend({ dirty: isNewSection });
  });


  // Collect allowedParents list using tree order.
  // Prepand "– " string to title of each sections depending on nesting level.
  var allowedParents = [];

  // Prepend virtual Null-section to allowedParents list.
  // This is used instead of Knockout's optionsCaption because it does not
  // allow custom values - null in our case.
  allowedParents.push({ _id: null, title: t('value_section_none') });

  function fetchOtherSections(parent) {
    var sections = data.allowed_parents.filter(function (section) {
      return parent === (section.parent || null);
    });

    _.sortBy(sections, 'display_order').forEach(function (section) {
      var prefix = '| ' + _.repeat('– ', section.level);

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
  view.copySettingsFrom.subscribe(function (selectedSourceId) {
    if (!selectedSourceId) {
      // Reset field values to defaults.
      _.forEach(currentSection, function (field, key) {
        if (_.has(SECTION_FIELD_DEFAULTS, key)) {
          field(SECTION_FIELD_DEFAULTS[key]);
        }
      });
      return;
    }

    var selectedSourceSection = _.find(data.allowed_parents, { _id: selectedSourceId });

    if (!selectedSourceSection) {
      N.logger.error('Cannot find section %j in page data.', selectedSourceId);
      return;
    }

    // Copy field values.
    _.forEach(currentSection, function (field, key) {
      if (_.has(selectedSourceSection, key)) {
        field(selectedSourceSection[key]);
      }
    });
  });

  // Check if any field values of currentSection were changed.
  view.isDirty = ko.computed(function () {
    return _.some(currentSection, function (field) {
      return field.isDirty();
    });
  });

  // Save new section.
  view.create = function create() {
    var request = {};

    _.forEach(currentSection, function (field, key) {
      request[key] = field();
    });

    N.io.rpc('admin.forum.section.create', request).then(function () {
      _.forEach(currentSection, function (field) {
        field.markClean();
      });

      N.wire.emit('notify', { type: 'info', message: t('message_created') });
      N.wire.emit('navigate.to', { apiPath: 'admin.forum.section.index' });
    });
  };

  // Save actually existent currentSection.
  view.update = function update() {
    var request = { _id: data.current_section._id };

    _.forEach(currentSection, function (field, key) {
      request[key] = field();
    });

    N.io.rpc('admin.forum.section.update', request).then(function () {
      _.forEach(currentSection, function (field) {
        field.markClean();
      });

      N.wire.emit('notify', { type: 'info', message: t('message_updated') });
    });
  };

  ko.applyBindings(view, $('#content')[0]);
});


N.wire.on(module.apiPath + '.teardown', function page_teardown() {
  view = null;
  ko.cleanNode($('#content')[0]);
});
