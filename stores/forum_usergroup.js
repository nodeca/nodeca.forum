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

  // Memoized version of fetchUserGroups helper
  //
  var fetchSectionSettingsCached = memoizee(fetchSectionSettings, {
    // memoizee options. revalidate cache after 30 sec
    async:     true
  , maxAge:    30000
  , primitive: true
  });


  // ##### Params
  //
  // - usergroup_ids (Array)
  // - forum_id (String|ObjectId)
  //
  var ForumGroupStore = N.settings.createStore({
    get: function (keys, params, options, callback) {
      if (!params.forum_id) {
        callback('forum_id param is required for getting settings from forum_usergroup store');
        return;
      }

      if (!_.isArray(params.usergroup_ids) || _.isEmpty(params.usergroup_ids)) {
        callback('usergroup_ids param required to be non-empty array for getting settings from forum_usergroup store');
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
          callback('Forum section ' + params.forum_id + ' not exists.');
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
  , set: function (settings, params, callback) {
      if (!params.forum_id) {
        callback('forum_id param is required for saving settings into forum_usergroup store');
        return;
      }

      if (!params.usergroup_id) {
        callback('usergroup_id param is required for saving settings into forum_usergroup store');
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

        var usergroupId = params.usergroup_id;

        // Make sure we have settings storages.
        section.settings                              = section.settings || {};
        section.settings.forum_usergroup              = section.settings.forum_usergroup || {};
        section.settings.forum_usergroup[usergroupId] = section.settings.forum_usergroup[usergroupId] || {};

        _.forEach(settings, function (setting, key) {
          if (null === setting) {
            delete section.settings.forum_usergroup[usergroupId][key];
          } else {
            section.settings.forum_usergroup[usergroupId][key] = setting;
          }
        });

        section.markModified('settings.forum_usergroup');
        section.save(callback);
      });
    }
  });

  return ForumGroupStore;
};
