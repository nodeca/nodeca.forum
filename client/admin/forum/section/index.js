'use strict';


var _  = require('lodash');
var ko = require('knockout');


function Section(fields, children) {
  fields = fields || {};

  this._id    = ko.observable(fields._id    || null                  ).extend({ dirty: false });
  this.title  = ko.observable(fields.title  || t('new_section_title')).extend({ dirty: false });
  this.parent = ko.observable(fields.parent || null                  ).extend({ dirty: false });

  this.moderator_list = ko.observableArray(_.map(fields.moderator_list, function (moderatorId) {
    var moderator = N.runtime.page_data.users[moderatorId];
    return { name: moderator._uname, href: '#' };
  }));

  this.hasModerators = ko.computed(function () {
    return !_.isEmpty(this.moderator_list());
  }, this);

  this.children = ko.observableArray(_.map(children, function (section) {
    return new Section(section.fields, section.children);
  }));

  this.showChildren = ko.observable(true);

  this.href = '#';
  this.moderatorsInfo = t('moderators_info', { count: this.moderator_list().length });
}

Section.prototype.destroy = function destroy() {
};

Section.prototype.newModerator = function newModerator() {
};


function Form(sections) {
  this.sections = ko.observableArray(_.map(sections, function (section) {
    return new Section(section.fields, section.children);
  }));
}


N.wire.on('navigate.done:' + module.apiPath, function () {
  ko.applyBindings(new Form(N.runtime.page_data.sections), $('#content')[0]);
  
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
      var offsetTop;
      
      if (document.documentElement.scrollTop) {
        offsetTop = document.documentElement.scrollTop - $(this).offset().top;
      } else if (document.body.scrollTop) {
        offsetTop = document.body.scrollTop - $(this).offset().top;
      }

      $('.section-placeholder').show();

      if (document.documentElement.scrollTop) {
        document.documentElement.scrollTop = $(this).offset().top + offsetTop;
      } else if (document.body.scrollTop) {
        document.body.scrollTop = $(this).offset().top + offsetTop;
      }
    }
  , stop: function () {
      $(this).removeClass('section-dragging');
      $('.section-placeholder').hide();
    }
  });

  $('.section-placeholder').droppable({
    hoverClass: 'section-placeholder-hover'
  , tolerance: 'pointer'
  , drop: function (event, ui) {
      ui.draggable.prev().insertBefore(this);
      ui.draggable.insertBefore(this);
    }
  });
});


N.wire.on('navigate.exit:' + module.apiPath, function () {
  ko.cleanNode($('#content')[0]);
});
