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

  view.activeSection = data.active_section ? _.clone(data.active_section) : { _id: null };
  _.defaults(view.activeSection, SECTION_FIELD_DEFAULTS);
  view.otherSections = [];
  view.isNewSection  = (null === view.activeSection._id);

  // Create observable fields on activeSection.
  _.forEach(SECTION_FIELD_NAMES, function (field) {
    view.activeSection[field] = ko.observable(view.activeSection[field]).extend({ dirty: view.isNewSection });
  });

  // Prepend virtual Null-section to otherSections list.
  // This is used instead of Knockout's optionsCaption because it does not
  // allow custom values - null in our case.
  view.otherSections.push({ _id: null, title: t('value_section_none') });

  // Collect otherSections list using tree order.
  // Prepand "– " string to title of each sections depending on nesting level.
  function fetchOtherSections(parent) {
    var sections = _.select(data.other_sections, function (section) {
      return parent === (section.parent || null);
    });

    _(sections).sortBy('display_order').forEach(function (section) {
      var level = section.level, prefix = '';

      do { prefix += '– '; level -= 1; } while (level >= 0);

      view.otherSections.push({
        _id:   section._id
      , title: prefix + section.title
      });

      fetchOtherSections(section._id); // Fetch children sections.
    });
  }
  fetchOtherSections(null); // Fetch root sections.

  // "Copy another section" special field.
  view.copySection = ko.observable(null);
  view.copySection.subscribe(function (targetId) {
    if (!targetId) {
      // Reset field values to defaults.
      _.forEach(SECTION_FIELD_NAMES, function (field) {
        view.activeSection[field](SECTION_FIELD_DEFAULTS[field]);
      });
      return;
    }

    var targetSection = _.find(data.other_sections, { _id: targetId });

    if (!targetSection) {
      N.logger.error('Cannot find section %j in page data.', targetId);
      return;
    }

    // Copy field values.
    _.forEach(SECTION_FIELD_NAMES, function (field) {
      view.activeSection[field](targetSection[field]);
    });
  });

  // Check if any field values of activeSection were changed.
  view.isDirty = ko.computed(function () {
    return _.any(SECTION_FIELD_NAMES, function (field) {
      return view.activeSection[field].isDirty();
    });
  });

  // Save new section.
  view.create = function create() {
    var payload = {};

    _.forEach(SECTION_FIELD_NAMES, function (field) {
      payload[field] = view.activeSection[field]();
    });

    N.io.rpc('admin.forum.section.create', payload, function (err) {
      if (err) {
        // Invoke standard error handling.
        return false;
      }

      N.wire.emit('notify', { type: 'info', message: t('message_created') });
      N.wire.emit('navigate.to', { apiPath: 'admin.forum.section.index' });
    });
  };

  // Save actually existent activeSection.
  view.update = function update() {
    var payload = { _id: view.activeSection._id };

    _.forEach(SECTION_FIELD_NAMES, function (field) {
      payload[field] = view.activeSection[field]();
      view.activeSection[field].markClean();
    });

    N.io.rpc('admin.forum.section.update', payload, function (err) {
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
