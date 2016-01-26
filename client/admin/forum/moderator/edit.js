'use strict';


var _  = require('lodash');
var ko = require('knockout');


function Setting(name, schema, value, overriden) {
  var tName = '@admin.core.setting_names.' + name,
      tHelp = '@admin.core.setting_names.' + name + '_help';

  this.elementId = 'setting_' + name; // HTML id attribute.
  this.localizedName = t(tName);
  this.localizedHelp = t.exists(tHelp) ? N.runtime.t(tHelp) : null;

  this.name = name;
  this.type = schema.type;

  this.overriden = ko.observable(Boolean(overriden)).extend({ dirty: false });
  this.inherited = ko.computed(function () { return !this.overriden(); }, this);

  this._value = ko.observable(value).extend({ dirty: false });
  this.value = ko.computed({
    read() {
      if (this.overriden()) {
        // Use overriden.
        return this._value();

      } else if (N.runtime.page_data.parent_settings &&
                 N.runtime.page_data.parent_settings[this.name] &&
                _.has(N.runtime.page_data.parent_settings[this.name], 'own')) {
        // Use parent section.
        return N.runtime.page_data.parent_settings[this.name].value;

      } else if (N.runtime.page_data.usergroup_settings &&
                 N.runtime.page_data.usergroup_settings[this.name]) {
        // Use usergroup.
        return N.runtime.page_data.usergroup_settings[this.name].value;

      }

      // Use defaults.
      return schema['default'];
    },
    write(value) {
      this.overriden(true);
      this._value(value);
    },
    owner: this
  });

  this.isDirty = ko.computed(function () {
    return (this.overriden.isDirty()) ||
           (this.overriden() && this._value.isDirty());
  }, this);
}

Setting.prototype.markClean = function markClean() {
  this.overriden.markClean();
  this._value.markClean();
};


// Knockout bindings root object.
var view = null;


N.wire.on('navigate.done:' + module.apiPath, function page_setup(data) {
  view = {};

  view.settings = _.map(N.runtime.page_data.setting_schemas, function (schema, name) {
    var value, overriden;

    overriden = N.runtime.page_data.settings &&
                N.runtime.page_data.settings[name] &&
                N.runtime.page_data.settings[name].own;

    if (overriden) {
      // Use overriden.
      value = N.runtime.page_data.settings[name].value;

    } else if (N.runtime.page_data.parent_settings &&
               N.runtime.page_data.parent_settings[name] &&
               _.has(N.runtime.page_data.parent_settings[name], 'own')) {
      // Use parent section.
      value = N.runtime.page_data.parent_settings[name].value;

    } else if (N.runtime.page_data.usergroup_settings &&
               N.runtime.page_data.usergroup_settings[name]) {
      // Use usergroup.
      value = N.runtime.page_data.usergroup_settings[name].value;

    } else {
      // Use defaults.
      value = schema['default'];
    }

    return new Setting(name, schema, value, overriden);
  });

  // Show "Remove permissions" button only is moderator has saved overriden settings.
  view.showRemoveButton = ko.observable(view.settings.some(function (setting) {
    return setting.overriden();
  }));

  view.isDirty = ko.computed(function () {
    return view.settings.some(function (setting) {
      return setting.isDirty();
    });
  });

  view.save = function save() {
    var request = {
      section_id: data.params.section_id,
      user_id:    data.params.user_id,
      settings:   {}
    };

    view.settings.forEach(function (setting) {
      if (setting.overriden()) {
        request.settings[setting.name] = { value: setting.value() };
      } else {
        request.settings[setting.name] = null;
      }
    });

    N.io.rpc('admin.forum.moderator.update', request).done(function () {
      view.settings.forEach(function (setting) { setting.markClean(); });

      // Show "Delete" button if there are some overriden settings after save.
      view.showRemoveButton(view.settings.some(function (setting) {
        return setting.overriden();
      }));

      N.wire.emit('notify', { type: 'info', message: t('message_saved') });
    });
  };

  view.destroy = function destroy() {
    N.wire.emit('admin.core.blocks.confirm', t('confirm_remove'), function () {

      var request = {
        section_id: data.params.section_id,
        user_id:    data.params.user_id
      };

      N.io.rpc('admin.forum.moderator.destroy', request).done(function () {
        N.wire.emit('notify', { type: 'info', message: t('message_deleted') });
        N.wire.emit('navigate.to', { apiPath: 'admin.forum.moderator.index' });
      });
    });
  };

  ko.applyBindings(view, $('#content')[0]);
  $('#moderator_edit_form').show();
});


N.wire.on('navigate.exit:' + module.apiPath, function page_exit() {
  view = null;
  ko.cleanNode($('#content')[0]);
});
