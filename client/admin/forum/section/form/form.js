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

var SECTION_COPYABLE_FIELD_NAMES = _.without(SECTION_FIELD_NAMES, 'title', 'description');


// Knockout bindings root object.
var view = null;


N.wire.on(module.apiPath + '.setup', function page_setup(data) {
  view = {};
  view.activeSection = _.defaults(data.active_section || {}, SECTION_FIELD_DEFAULTS);
  view.otherSections = data.other_sections;

  // Create observable fields on activeSection.
  _.forEach(SECTION_FIELD_NAMES, function (field) {
    view.activeSection[field] = ko.observable(view.activeSection[field]).extend({ dirty: false });
  });

  // Prepand "– " string to titles of otherSections depending on nesting level.
  _.forEach(view.otherSections, function (section) {
    var level = section.level, prefix = '';

    do { prefix += '– '; level -= 1; } while (level >= 0);

    section.title = prefix + section.title;
  });

  // Prepend virtual Null-section to otherSections list.
  // This is used instead of Knockout's optionsCaption because it does not
  // allow custom values - null in our case.
  view.otherSections = [{ _id: null, title: t('value_section_none') }].concat(view.otherSections);

  // "Copy another section" special field.
  view.copySection = ko.observable(null);
  view.copySection.subscribe(function (targetId) {
    if (!targetId) {
      // Reset field values to defaults.
      _.forEach(SECTION_COPYABLE_FIELD_NAMES, function (field) {
        view.activeSection[field](SECTION_FIELD_DEFAULTS[field]);
      });
      return;
    }

    var targetSection = _.find(view.otherSections, { _id: targetId });

    if (!targetSection) {
      N.logger.error('Cannot find section %j in page data.', targetId);
      return;
    }

    // Copy field values.
    _.forEach(SECTION_COPYABLE_FIELD_NAMES, function (field) {
      view.activeSection[field](targetSection[field]);
    });
  });

  // Check if any field values of activeSection were changed.
  view.isDirty = ko.computed(function () {
    return _.any(SECTION_FIELD_NAMES, function (field) {
      return view.activeSection[field].isDirty();
    });
  });

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
