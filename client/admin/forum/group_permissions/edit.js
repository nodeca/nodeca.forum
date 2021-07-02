'use strict';


const ko = require('knockout');


function Setting(name, schema, value, overriden) {
  let tName = '@admin.core.setting_names.' + name,
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
        return this.type === 'number' ? Number(this._value()) : this._value();

      } else if (N.runtime.page_data.parent_settings?.[this.name]?.own) {
        // Use parent section.
        return N.runtime.page_data.parent_settings[this.name].value;

      } else if (N.runtime.page_data.usergroup_settings?.[this.name]) {
        // Use usergroup.
        return N.runtime.page_data.usergroup_settings[this.name].value;
      }

      // Use defaults.
      return schema.default;
    },
    write(value) {
      this.overriden(true);
      this._value(value);
    },
    owner: this
  });

  this.isDirty = ko.computed(() => (this.overriden.isDirty()) ||
                                   (this.overriden() && this._value.isDirty()));
}

Setting.prototype.markClean = function markClean() {
  this.overriden.markClean();
  this._value.markClean();
};


// Knockout bindings root object.
let view = null;


N.wire.on('navigate.done:' + module.apiPath, function page_setup(data) {
  view = {};

  view.settings = Object.entries(N.runtime.page_data.setting_schemas).map(([ name, schema ]) => {
    let value, overriden;

    overriden = N.runtime.page_data.settings?.[name]?.own;

    if (overriden) {
      // Use overriden.
      value = N.runtime.page_data.settings[name].value;

    } else if (N.runtime.page_data.parent_settings?.[name]?.own) {
      // Use parent section.
      value = N.runtime.page_data.parent_settings[name].value;

    } else if (N.runtime.page_data.usergroup_settings?.[name]) {
      // Use usergroup.
      value = N.runtime.page_data.usergroup_settings[name].value;

    } else {
      // Use defaults.
      value = schema.default;
    }

    return new Setting(name, schema, value, overriden);
  });

  view.isDirty = ko.computed(() => view.settings.some(setting => setting.isDirty()));

  view.save = function save() {
    let request = {
      section_id:   data.params.section_id,
      usergroup_id: data.params.usergroup_id,
      settings:     {}
    };

    view.settings.forEach(setting => {
      if (setting.overriden()) {
        request.settings[setting.name] = { value: setting.value() };
      } else {
        request.settings[setting.name] = null;
      }
    });

    N.io.rpc('admin.forum.group_permissions.update', request).then(() => {
      view.settings.forEach(setting => setting.markClean());

      return N.wire.emit('notify.info', t('message_saved'));
    }).catch(err => N.wire.emit('error', err));
  };

  ko.applyBindings(view, $('#content')[0]);
  $('#group_permissions_edit_form').show();
});


N.wire.on('navigate.exit:' + module.apiPath, function page_exit() {
  view = null;
  ko.cleanNode($('#content')[0]);
});
