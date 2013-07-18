'use strict';


var _  = require('lodash');
var ko = require('knockout');


function Setting(name, schema, value, overriden, forced) {
  var tName = '@admin.core.setting_names.' + name
    , tHelp = '@admin.core.setting_names.' + name + '_help';


  this.elementId = 'setting_' + name; // HTML id attribute.
  this.localizedName = t(tName);
  this.localizedHelp = t.exists(tHelp) ? N.runtime.t(tHelp) : null;

  this.name = name;
  this.type = schema.type;

  this.overriden = ko.observable(Boolean(overriden)).extend({ dirty: false });
  this.inherited = ko.computed(function () { return !this.overriden(); }, this);
  this.forced = ko.observable(Boolean(forced)).extend({ dirty: false });

  this._value = ko.observable(value).extend({ dirty: false });
  this.value = ko.computed({
    read: function () {
      if (this.overriden()) {
        return this._value();
      } else if (_.has(N.runtime.page_data.parent_settings, name)) {
        return N.runtime.page_data.parent_settings[this.name].value;
      } else {
        return schema['default'];
      }
    }
  , write: function (value) {
      this.overriden(true);
      this._value(value);
    }
  , owner: this
  });

  this.isDirty = ko.computed(function () {
    return (this.overriden.isDirty()) ||
           (this.overriden() && this.forced.isDirty()) ||
           (this.overriden() && this._value.isDirty());
  }, this);

  this.showOverrideCheckbox = _.has(N.runtime.page_data.parent_settings, name);
  this.showForceCheckbox = ko.computed(function () {
    return this.showOverrideCheckbox && this.overriden();
  }, this);

  this.overriden.subscribe(function (overriden) {
    if (!overriden) {
      this.forced(false);
    }
  }, this);
}

Setting.prototype.markClean = function markClean() {
  this.overriden.markClean();
  this.forced.markClean();
  this._value.markClean();
};


// Knockout bindings root object.
var view = null;


N.wire.on('navigate.done:' + module.apiPath, function page_setup(data) {
  view = {};

  view.settings = _.map(N.runtime.page_data.setting_schemas, function (schema, name) {
    var value, overriden, forced;

    overriden = N.runtime.page_data.settings[name] &&
                N.runtime.page_data.settings[name].overriden;

    if (overriden) {
      // Use overriden.
      value  = N.runtime.page_data.settings[name].value;
      forced = N.runtime.page_data.settings[name].force;

    } else if (_.has(N.runtime.page_data.parent_settings, name)) {
      // Use parent.
      value  = N.runtime.page_data.parent_settings[name].value;
      forced = N.runtime.page_data.parent_settings[name].force;

    } else {
      // Use defaults for root-level section.
      value     = schema['default'];
      forced    = false;
      overriden = true;
    }

    return new Setting(name, schema, value, overriden, forced);
  });

  view.isDirty = ko.computed(function () {
    return _.any(view.settings, function (setting) {
      return setting.isDirty();
    });
  });

  view.save = function save() {
    var payload = {
      section_id:   data.params.section_id
    , usergroup_id: data.params.usergroup_id
    , settings:     {}
    };

    _.forEach(view.settings, function (setting) {
      payload.settings[setting.name] = {
        value:     setting.value()
      , force:     setting.forced()
      , overriden: setting.overriden()
      };
    });

    _.forEach(view.settings, function (setting) {
      setting.markClean();
    });

    N.io.rpc('admin.forum.section_permissions.update', payload, function (err) {
      if (err) {
        return false; // Invoke standard error handling.
      }

      N.wire.emit('notify', { type: 'info', message: t('message_saved') });
    });
  };

  ko.applyBindings(view, $('#content')[0]);
  $('#section_permissions_edit_form').show();
});


N.wire.on('navigate.exit:' + module.apiPath, function page_setup() {
  view = null;
  ko.cleanNode($('#content')[0]);
});
