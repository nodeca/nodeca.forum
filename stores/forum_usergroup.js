'use strict';


var _        = require('lodash');
var memoizee = require('memoizee');


module.exports = function (N) {

  // Helper to fetch usergroups by IDs
  //
  function fetchSectionSettings(id, callback) {
    N.models.forum.Section
      .findById(id)
      .select('settings.forum_usergroup')
      .setOptions({ lean: true })
      .exec(callback);
  }

  // Memoized version of `fetchSectionSettings` helper.
  // Revalidate cache after 30 seconds.
  //
  var fetchSectionSettingsCached = memoizee(fetchSectionSettings, {
    async:     true
  , maxAge:    30000
  , primitive: true
  });


  var ForumUsergroupStore = N.settings.createStore({
    //
    // params:
    //   forum_id      - ObjectId
    //   usergroup_ids - Array of ObjectIds
    //
    // options:
    //   skipCache     - Boolean
    //
    get: function (keys, params, options, callback) {
      if (!params.forum_id) {
        callback('`forum_id` parameter is required for getting settings from `forum_usergroup` store.');
        return;
      }

      if (!_.isArray(params.usergroup_ids) || _.isEmpty(params.usergroup_ids)) {
        callback('`usergroup_ids` parameter required to be non-empty array for getting settings from `forum_usergroup` store.');
        return;
      }

      var self  = this
        , fetch = options.skipCache ? fetchSectionSettings : fetchSectionSettingsCached;

      fetch(params.forum_id, function (err, section) {
        if (err) {
          callback(err);
          return;
        }

        if (!section) {
          callback('Forum section `' + params.forum_id + '` not exists.');
          return;
        }

        var results = {};

        _.forEach(keys, function (key) {
          var values = [];

          _.forEach(params.usergroup_ids, function (usergroupId) {
            if (section.settings &&
                section.settings.forum_usergroup &&
                section.settings.forum_usergroup[usergroupId] &&
                section.settings.forum_usergroup[usergroupId][key]) {
              values.push(section.settings.forum_usergroup[usergroupId][key]);
            } else {
              values.push({
                value: self.getDefaultValue(key)
              , force: false
              });
            }
          });

          // Get merged value.
          results[key] = N.settings.mergeValues(values);
        });

        callback(null, results);
      });
    }
    //
    // params:
    //   forum_id - ObjectId
    //
  , set: function (settings, params, callback) {
      if (!params.forum_id) {
        callback('`forum_id` parameter is required for saving settings into `forum_usergroup` store.');
        return;
      }

      N.models.forum.Section.findById(params.forum_id, function (err, section) {
        if (err) {
          callback(err);
          return;
        }

        if (!section) {
          callback('Forum section ' + params.forum_id + ' not exists.');
          return;
        }

        section.settings = section.settings || {};
        section.settings.forum_usergroup = settings;
        section.markModified('settings.forum_usergroup');
        section.save(callback);
      });
    }
  , validate: function (data) {
      var formatError = 'Bad input for `forum_usergroup` settings store. Must be: { usergroup_id: { setting_name: { value: Mixed, force: Boolean } } }';

      if (!_.isObject(data)) {
        throw new Error(formatError);
      }

      _.forEach(data, function (settings) {
        if (!_.isObject(settings)) {
          throw new Error(formatError);
        }

        _.forEach(settings, function (setting, key) {
          if (!_.isObject(setting)) {
            throw new Error(formatError);
          }

          if (!_.has(setting, 'value')) {
            throw new Error(formatError);
          }

          if (!_.isBoolean(setting.force)) {
            throw new Error(formatError);
          }

          if (2 !== _.keys(setting).length) {
            throw new Error(formatError);
          }

          var validationError = this.validateSetting(key, setting.value);

          if (null !== validationError) {
            throw validationError;
          }
        }, this);
      }, this);
    }
  });

  return ForumUsergroupStore;
};
