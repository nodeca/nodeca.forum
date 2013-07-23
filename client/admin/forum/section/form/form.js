'use strict';


var _  = require('lodash');
var ko = require('knockout');


var SECTION_FIELD_DEFAULTS = {
  'title':          ''
, 'description':    ''
, 'parent':         null
, 'is_category':    false
, 'is_enabled':     true
, 'is_writeble':    true
, 'is_searcheable': true
, 'is_voteable':    true
, 'is_counted':     true
, 'is_excludable':  true
};

var SECTION_FIELD_NAMES = _.keys(SECTION_FIELD_DEFAULTS);


// Knockout bindings root object.
var view = null;


N.wire.on(module.apiPath + '.setup', function page_setup(data) {
  view = {};

  view.currentSection = data.current_section ? _.clone(data.current_section) : { _id: null };
  _.defaults(view.currentSection, SECTION_FIELD_DEFAULTS);
  view.allowedParents = [];
  view.isNewSection   = (null === view.currentSection._id);

  // Create observable fields on currentSection.
  _.forEach(SECTION_FIELD_NAMES, function (field) {
    view.currentSection[field] = ko.observable(view.currentSection[field]).extend({ dirty: view.isNewSection });
  });

  // Prepend virtual Null-section to allowedParents list.
  // This is used instead of Knockout's optionsCaption because it does not
  // allow custom values - null in our case.
  view.allowedParents.push({ _id: null, title: t('value_section_none') });

  // Collect allowedParents list using tree order.
  // Prepand "– " string to title of each sections depending on nesting level.
  function fetchOtherSections(parent) {
    var sections = _.select(data.allowed_parents, function (section) {
      return parent === (section.parent || null);
    });

    _(sections).sortBy('display_order').forEach(function (section) {
      var level = section.level, prefix = '';

      do { prefix += '– '; level -= 1; } while (level >= 0);

      view.allowedParents.push({
        _id:   section._id
      , title: prefix + section.title
      });

      fetchOtherSections(section._id); // Fetch children sections.
    });
  }
  fetchOtherSections(null); // Fetch root sections.

  // "Copy settings from" special field.
  view.copySettingsFrom = ko.observable(null);
  view.copySettingsFrom.subscribe(function (selectedSourceId) {
    if (!selectedSourceId) {
      // Reset field values to defaults.
      _.forEach(SECTION_FIELD_NAMES, function (field) {
        view.currentSection[field](SECTION_FIELD_DEFAULTS[field]);
      });
      return;
    }

    var selectedSourceSection = _.find(data.allowed_parents, { _id: selectedSourceId });

    if (!selectedSourceSection) {
      N.logger.error('Cannot find section %j in page data.', selectedSourceId);
      return;
    }

    // Copy field values.
    _.forEach(SECTION_FIELD_NAMES, function (field) {
      view.currentSection[field](selectedSourceSection[field]);
    });
  });

  // Check if any field values of currentSection were changed.
  view.isDirty = ko.computed(function () {
    return _.any(SECTION_FIELD_NAMES, function (field) {
      return view.currentSection[field].isDirty();
    });
  });

  // Save new section.
  view.create = function create() {
    var request = {};

    _.forEach(SECTION_FIELD_NAMES, function (field) {
      request[field] = view.currentSection[field]();
    });

    N.io.rpc('admin.forum.section.create', request, function (err) {
      if (err) {
        // Invoke standard error handling.
        return false;
      }

      N.wire.emit('notify', { type: 'info', message: t('message_created') });
      N.wire.emit('navigate.to', { apiPath: 'admin.forum.section.index' });
    });
  };

  // Save actually existent currentSection.
  view.update = function update() {
    var request = { _id: view.currentSection._id };

    _.forEach(SECTION_FIELD_NAMES, function (field) {
      request[field] = view.currentSection[field]();
      view.currentSection[field].markClean();
    });

    N.io.rpc('admin.forum.section.update', request, function (err) {
      if (err) {
        // Invoke standard error handling.
        return false;
      }

      N.wire.emit('notify', { type: 'info', message: t('message_updated') });
    });
  };

  ko.applyBindings(view, $('#content')[0]);
});


N.wire.on(module.apiPath + '.teardown', function page_teardown() {
  view = null;
  ko.cleanNode($('#content')[0]);
});
