'use strict';


var _        = require('lodash');
var async    = require('async');
var memoizee = require('memoizee');


module.exports = function (N) {

  // Helper to fetch usergroups by IDs
  //
  function fetchSectionSettings(id, callback) {
    N.models.forum.Section
      .findById(id)
      .select('settings')
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
    //   skipCache - Boolean
    //   verbose   - Boolean; Add `own` (aka non-inherited) property to result.
    //
    get: function (keys, params, options, callback) {
      if (!_.has(params, 'forum_id') || !_.has(params, 'usergroup_ids')) {
        // No required parameters - skip this store. In practice this happens
        // when we do N.settings.get for common (non-forum) usergroup settings.
        callback(null, null);
        return;
      }

      if (!params.forum_id) {
        callback('`forum_id` parameter is required for getting settings from `forum_usergroup` store.');
        return;
      }

      if (!_.isArray(params.usergroup_ids) || _.isEmpty(params.usergroup_ids)) {
        callback('`usergroup_ids` parameter required to be non-empty array for getting settings from `forum_usergroup` store.');
        return;
      }

      var fetch = options.skipCache ? fetchSectionSettings : fetchSectionSettingsCached;

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

        _.forEach(keys, function (settingName) {
          var settings = [];

          // Collect settings for given usergroups.
          // Skip non-provided settings to fallback to usergroup store.
          _.forEach(params.usergroup_ids, function (usergroupId) {
            if (!section.settings ||
                !section.settings.forum_usergroup ||
                !section.settings.forum_usergroup[usergroupId] ||
                !section.settings.forum_usergroup[usergroupId][settingName]) {
              return;
            }

            var setting = section.settings.forum_usergroup[usergroupId][settingName];

            // For verbose mode - get copy of whole setting object.
            // For normal mode - get copy of only value field.
            setting = options.verbose ? _.clone(setting) : _.pick(setting, 'value');

            // This store always implies `force` option, but we don't keep it
            // in the database.
            setting.force = true;

            settings.push(setting);
          });

          // Get merged value.
          if (!_.isEmpty(settings)) {
            results[settingName] = N.settings.mergeValues(settings);
          }
        });

        callback(null, (_.isEmpty(results) ? null : results));
      });
    }
    //
    // params:
    //   forum_id     - ObjectId
    //   usergroup_id - ObjectId
    //
  , set: function (settings, params, callback) {
      var self = this;

      if (!params.forum_id) {
        callback('`forum_id` parameter is required for saving settings into `forum_usergroup` store.');
        return;
      }

      if (!params.usergroup_id) {
        callback('`usergroup_id` parameter required for saving settings into `forum_usergroup` store.');
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

        if (!section.settings) {
          section.settings = {};
        }

        if (!section.settings.forum_usergroup) {
          section.settings.forum_usergroup = {};
        }
 
        // Copy input settings to modify them without side effects.
        settings = _.clone(settings, true);

        _.forEach(settings, function (setting) {
          // Mark all input settings as non-inherited.
          setting.own = true;

          // It's no need to put this into the database, since this store
          // always implies `force` at `Store#get`.
          delete setting.force;
        });

        section.settings.forum_usergroup[params.usergroup_id] = settings;
        section.markModified('settings');

        section.save(function (err) {
          if (err) {
            callback(err);
            return;
          }

          self.updateInherited(callback);
        });
      });
    }
  });


  // Update inherited setting on all sections.
  //
  ForumUsergroupStore.updateInherited = function updateInherited(callback) {
    var self = this;

    N.models.forum.Section.find({}, function (err, sections) {
      if (err) {
        callback(err);
        return;
      }

      // Find first own setting by name for usergroup.
      function findInheritedSetting(sectionId, usergroupId, settingName) {
        if (!sectionId) {
          return null;
        }

        var section = _.find(sections, function (section) {
          // Universal way for equal check on: Null, ObjectId, and String.
          return String(section._id) === String(sectionId);
        });

        if (!section) {
          N.logger.warn('Forum sections collection contains a reference to non-existent section %s', sectionId);
          return null;
        }

        // Setting exists, and it is not inherited from another section.
        if (section.settings &&
            section.settings.forum_usergroup &&
            section.settings.forum_usergroup[usergroupId] &&
            section.settings.forum_usergroup[usergroupId][settingName] &&
            section.settings.forum_usergroup[usergroupId][settingName].own) {
          return section.settings.forum_usergroup[usergroupId][settingName];
        }

        // Recursively walk through ancestors sequence.
        if (section.parent) {
          return findInheritedSetting(section.parent, usergroupId, settingName);
        }

        return null;
      }

      // Fetch list of all existent usergroup ids.
      N.models.users.UserGroup.find({}, '_id', { lean: true }, function (err, usergroups) {
        if (err) {
          callback(err);
          return;
        }

        async.forEach(sections, function (section, next) {
          _.forEach(usergroups, function (usergroup) {
            _.forEach(self.keys, function (settingName) {
              var setting = findInheritedSetting(section.parent, usergroup._id, settingName);

              if (!section.settings) {
                section.settings = {};
              }

              if (!section.settings.forum_usergroup) {
                section.settings.forum_usergroup = {};
              }

              if (!section.settings.forum_usergroup[usergroup._id]) {
                section.settings.forum_usergroup[usergroup._id] = {};
              }

              // Do not touch own settings. We only update inherited settings.
              if (section.settings.forum_usergroup[usergroup._id][settingName] &&
                  section.settings.forum_usergroup[usergroup._id][settingName].own) {
                return;
              }

              if (setting) {
                // Set/update inherited setting.
                section.settings.forum_usergroup[usergroup._id][settingName] = {
                  value: setting.value
                , own:   false
                };
              } else {
                // Drop deprected inherited setting.
                delete section.settings.forum_usergroup[usergroup._id][settingName];
              }
              section.markModified('settings');
            });
          });

          if (section.isModified()) {
            section.save(next);
          } else {
            next();
          }
        }, callback);
      });
    });
  };


  // Remove all setting entries for specific usergroup.
  //
  ForumUsergroupStore.removeUsergroup = function removeUsergroup(usergroupId, callback) {
    N.models.forum.Section.find({}, function (err, sections) {
      if (err) {
        callback(err);
        return;
      }

      async.forEach(sections, function (section, next) {
        if (!section.settings ||
            !section.settings.forum_usergroup ||
            !_.has(section.settings.forum_usergroup, usergroupId)) {
          next();
          return;
        }

        delete section.settings.forum_usergroup[usergroupId];
        section.markModified('settings');
        section.save(next);
      }, callback);
    });
  };


  return ForumUsergroupStore;
};
