'use strict';


var _  = require('lodash');
var ko = require('knockout');


function Section(fields, children) {
  fields = fields || {};

  this._id       = ko.observable(fields._id       || null                  ).extend({ dirty: false });
  this.id        = ko.observable(fields.id        || null                  ).extend({ dirty: false });
  this.title     = ko.observable(fields.title     || t('new_section_title')).extend({ dirty: false });
  this.level     = ko.observable(fields.level     || 0                     ).extend({ dirty: false });
  this.parent    = ko.observable(fields.parent    || null                  ).extend({ dirty: false });
  this.parent_id = ko.observable(fields.parent_id || null                  ).extend({ dirty: false });

  this.parent_list    = ko.observableArray(fields.parent_list    || []).extend({ dirty: false });
  this.parent_id_list = ko.observableArray(fields.parent_id_list || []).extend({ dirty: false });

  this.children = ko.observableArray(_.map(children, function (section) {
    return new Section(section.fields, section.children);
  }));

  this.showChildren = ko.observable(false);
}


function Form(sections) {
  this.sections = ko.observableArray(_.map(sections, function (section) {
    var section = new Section(section.fields, section.children);

    // Show children of all top-level sections.
    section.showChildren(true);

    return section;
  }));
}


N.wire.on('navigate.done:' + module.apiPath, function () {
  ko.applyBindings(new Form(N.runtime.page_data.sections), $('#content')[0]);

  $('.section-list').sortable({
    connectWith: '.section-list'
  , placeholder: 'section-placeholder'
  , corsorAt: { top: 5, left: 5 }
  , opacity: 0.4
  });
});


N.wire.on('navigate.exit:' + module.apiPath, function () {
  ko.cleanNode($('#content')[0]);
});
