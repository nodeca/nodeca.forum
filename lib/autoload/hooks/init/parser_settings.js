// Create parser settings for forum application. Use `markup` schema as template.
//
// Note (!) `markup` schema in not used directly, that's a special hidden category.
// Forum settings are completely independent.
//
// You can override any default property by creating appropriate setting definition directly. Values will be merged.
//
'use strict';


const _ = require('lodash');


module.exports = function (N) {
  N.wire.before('init:models', function init_forum_parser_settings() {
    const SETTINGS_PREFIX = 'forum_';
    const CATEGORY_KEY = 'forum_posts_markup';
    const GROUP_KEY = 'forum_editor';

    let settingKey;

    for (let [ key, setting ] of Object.entries(N.config.setting_schemas.markup)) {
      settingKey = SETTINGS_PREFIX + key;

      // Create setting in global schema if not exists
      if (!N.config.setting_schemas.global[settingKey]) {
        N.config.setting_schemas.global[settingKey] = {};
      }

      // Fill defaults for setting
      _.defaults(N.config.setting_schemas.global[settingKey], setting, {
        category_key: CATEGORY_KEY,
        group_key: GROUP_KEY
      });

      // Copy locale if not exists
      for (let locale of Object.keys(N.config.i18n)) {
        let from = `admin.core.setting_names.${key}`;
        let to = `admin.core.setting_names.${settingKey}`;

        if (!_.has(locale, to) && _.has(locale, from)) {
          _.set(locale, to, _.get(locale, from));
        }
      }
    }
  });
};
