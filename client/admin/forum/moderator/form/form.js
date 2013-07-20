'use strict';


var _  = require('lodash');
var ko = require('knockout');


function Setting(name, schema, value, overriden, dirty) {
  var tName = '@admin.core.setting_names.' + name
    , tHelp = '@admin.core.setting_names.' + name + '_help';


  this.elementId = 'setting_' + name; // HTML id attribute.
  this.localizedName = t(tName);
  this.localizedHelp = t.exists(tHelp) ? N.runtime.t(tHelp) : null;

  this.name = name;
  this.type = schema.type;
  this.hasParent = _.has(N.runtime.page_data.parent_settings, name);

  this.overriden = ko.observable(overriden).extend({ dirty: dirty });
  this.inherited = ko.computed(function () { return !this.overriden(); }, this);

  this._value = ko.observable(value).extend({ dirty: dirty });
  this.value = ko.computed({
    read: function () {
      if (this.overriden()) {
        return this._value();
      } else if (this.hasParent) {
        return N.runtime.page_data.parent_settings[this.name];
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
           (this.overriden() && this._value.isDirty());
  }, this);

  this.showOverrideCheckbox = this.hasParent; // Just an alias.
}

Setting.prototype.markClean = function markClean() {
  this.overriden.markClean();
  this._value.markClean();
};


// Knockout bindings root object.
var view = null;


var FIND_BY_NAME_MIN_LENGTH = 2;
var FIND_BY_NAME_DELAY      = 500;


N.wire.on(module.apiPath + '.setup', function page_setup(data) {
  var section_id = data.params.section_id || null
    , user_id    = data.params.user_id    || null;

  view = {};
  view.isNewModerator = (null === user_id);

  if (view.isNewModerator) {
    $('#moderator_search').autocomplete({
      minLength: FIND_BY_NAME_MIN_LENGTH
    , delay:     FIND_BY_NAME_DELAY
    , source: function (request, suggestions) {
        N.io.rpc('admin.forum.moderator.find', { search: request.term }, function (err, response) {
          if (err) {
            suggestions();
            return false; // Invoke standard error handling.
          }
          suggestions(response.data.suggestions);
        });
      }
    , focus: function (event, ui) {
        $(this).val(ui.item.label);
        event.preventDefault();
      }
    , select: function (event, ui) {
        user_id = ui.item.value;
        $(this).val(ui.item.label);
        event.preventDefault();
      }
    });
  }

  view.settings = _.map(N.runtime.page_data.setting_schemas, function (schema, name) {
    var value, overriden;

    overriden = _.has(N.runtime.page_data.settings, name);

    if (overriden) {
      // Use overriden.
      value = N.runtime.page_data.settings[name];

    } else if (_.has(N.runtime.page_data.parent_settings, name)) {
      // Use parent.
      value = N.runtime.page_data.parent_settings[name];

    } else {
      // Use defaults for root-level moderator's permissions set.
      value     = schema['default'];
      overriden = true;
    }

    return new Setting(name, schema, value, overriden, view.isNewModerator);
  });

  view.isDirty = ko.computed(function () {
    return _.any(view.settings, function (setting) {
      return setting.isDirty();
    });
  });

  view.create = function create() {
    if (!user_id) {
      N.wire.emit('notify', t('error_user_not_selected'));
      return;
    }

    var payload = {
      section_id: section_id
    , user_id:    user_id
    , settings:   {}
    };

    _.forEach(view.settings, function (setting) {
      if (setting.overriden()) {
        payload.settings[setting.name] = setting.value();
      }
    });

    _.forEach(view.settings, function (setting) {
      setting.markClean();
    });

    N.io.rpc('admin.forum.moderator.update', payload, function (err) {
      if (err) {
        return false; // Invoke standard error handling.
      }

      N.wire.emit('notify', { type: 'info', message: t('message_created') });
      N.wire.emit('navigate.to', { apiPath: 'admin.forum.section.index' });
    });
  };

  view.update = function update() {
    var payload = {
      section_id: section_id
    , user_id:    user_id
    , settings:   {}
    };

    _.forEach(view.settings, function (setting) {
      if (setting.overriden()) {
        payload.settings[setting.name] = setting.value();
      }
    });

    _.forEach(view.settings, function (setting) {
      setting.markClean();
    });

    N.io.rpc('admin.forum.moderator.update', payload, function (err) {
      if (err) {
        return false; // Invoke standard error handling.
      }

      N.wire.emit('notify', { type: 'info', message: t('message_updated') });
    });
  };

  ko.applyBindings(view, $('#content')[0]);
  $('#moderator_form').show();
});


N.wire.on(module.apiPath + '.teardown', function page_setup() {
  view = null;
  ko.cleanNode($('#content')[0]);
});
