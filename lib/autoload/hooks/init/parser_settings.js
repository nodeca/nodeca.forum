// Create parser settings for forum application. Use `markup` schema as template.
//
// Note (!) `markup` schema in not used directly, that's a special hidden category.
// Forum settings are completely independent.
//
// You can override any default property by creating appropriate setting definition directly. Values will be merged.
//
'use strict';

var _ = require('lodash');

module.exports = function (N) {
  N.wire.before('init:models', function init_parser_settings() {
    var APP_PREFIX = 'forum_';
    var CATEGORY_KEY = 'forum_markup';
    var GROUP_KEY = 'forum_general';

    var settingKey;

    _.forEach(N.config.setting_schemas.markup, function (setting, key) {
      settingKey = APP_PREFIX + key;

      // Create setting in global schema if not exists
      if (!N.config.setting_schemas.global[settingKey]) {
        N.config.setting_schemas.global[settingKey] = {};
      }

      // Fill defaults for setting
      _.defaults(N.config.setting_schemas.global[settingKey], setting, {
        category_key: CATEGORY_KEY,
        group_key: GROUP_KEY
      });

      // Create setting in usergroup schema if not exists
      if (!N.config.setting_schemas.usergroup[settingKey]) {
        N.config.setting_schemas.usergroup[settingKey] = {};
      }

      // Fill defaults for setting
      _.defaults(N.config.setting_schemas.usergroup[settingKey], setting, { category_key: CATEGORY_KEY });

      // Copy locale if not exists
      _.forEach(N.config.i18n, function (locale) {
        if (
          locale.admin &&
          locale.admin.core &&
          locale.admin.core.setting_names &&
          !locale.admin.core.setting_names[settingKey]
        ) {
          locale.admin.core.setting_names[settingKey] = locale.admin.core.setting_names[key];
        }
      });
    });
  });
};
