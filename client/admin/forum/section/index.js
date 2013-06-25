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

  var dragHelper = $('<div>').css('height', '20px').css('width', '20px')[0];

  $('.section-draggable').sortable({
    handle: '.section-handle'
  , helper: function () { return dragHelper; }
  , connectWith: '.section-draggable'
  , placeholder: 'section-placeholder'
  , cursor: 'move'
  , cursorAt: { top: 0, left: 0 }
  , change: function () {
      $('.section-children-placeholder').removeClass('section-children-placeholder');
      $('.section-placeholder').prev().children('.section-children:empty').addClass('section-children-placeholder');
    }
  });
});


N.wire.on('navigate.exit:' + module.apiPath, function () {
  ko.cleanNode($('#content')[0]);
});
