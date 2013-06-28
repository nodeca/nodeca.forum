'use strict';


var _  = require('lodash');
var ko = require('knockout');


// List of all available sections.
var sections = null;


function Section(fields) {
  this._id   = fields._id;
  this.title = fields.title;

  this.parent = ko.observable(fields.parent || null).extend({ dirty: false });

  this.moderator_list = ko.observableArray(_.map(fields.moderator_list, function (moderatorId) {
    var moderator = N.runtime.page_data.users[moderatorId];
    return { name: moderator._uname, href: '#' };
  })).extend({ dirty: false });

  this.hasModerators = ko.computed(function () {
    return !_.isEmpty(this.moderator_list());
  }, this);

  this.moderatorsInfo = ko.computed(function () {
    return t('moderators_info', { count: this.moderator_list().length });
  }, this);

  this.href = '#';
}

Section.prototype.destroy = function destroy() {
};

Section.prototype.newModerator = function newModerator() {
};


N.wire.on('navigate.done:' + module.apiPath, function () {
  function generateSectionModels(dataList) {
    _.forEach(dataList, function (data) {
      sections.push(new Section(data.fields));

      // Recursively generate children.
      generateSectionModels(data.children);
    });
  }

  // Generate full sections list.
  sections = [];
  generateSectionModels(N.runtime.page_data.sections);

  // Apply section bindings.
  _.forEach(sections, function (section) {
    ko.applyBindings(section, $('#section_' + section._id)[0]);
  });
 
  // Make sections draggable (both section control and children).
  $('.section-group').draggable({
    handle: '.section-handle'
  , revert: 'invalid'
  , helper: 'clone'
  , opacity: 0.5
  , cursor: 'move'
  , start: function () {
      $(this).addClass('section-dragging');

      // To scroll window:
      // - WebKit-based browsers and the quirks mode use `body` element.
      // - Other browsers use `html` element.
      var screenOffsetTop;
  
      // Calculate element offset relative to upper edge of viewport.
      if (document.documentElement.scrollTop) {
        screenOffsetTop = $(this).offset().top - document.documentElement.scrollTop;
      } else if (document.body.scrollTop) {
        screenOffsetTop = $(this).offset().top - document.body.scrollTop;
      }

      $('.section-placeholder').show();

      // After placeholders are shown, restore the offset to prevent jerk effect.
      if (document.documentElement.scrollTop) {
        document.documentElement.scrollTop = $(this).offset().top - screenOffsetTop;
      } else if (document.body.scrollTop) {
        document.body.scrollTop = $(this).offset().top - screenOffsetTop;
      }
    }
  , stop: function () {
      $(this).removeClass('section-dragging');
      $('.section-placeholder').hide();
    }
  });

  // Make all placeholders (hidden by default) droppable.
  $('.section-placeholder').droppable({
    accept: '.section-group'
  , hoverClass: 'section-placeholder-hover'
  , tolerance: 'pointer'
  , drop: function (event, ui) {
      // Move section and it's allied placeholder into new location.
      ui.draggable.prev().filter('.section-placeholder').insertBefore(this);
      ui.draggable.insertBefore(this);
    }
  });
});


N.wire.on('navigate.exit:' + module.apiPath, function () {
  sections = null;
  ko.cleanNode($('#content')[0]);
});
