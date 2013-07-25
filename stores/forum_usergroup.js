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
    //   skipCache  - Boolean
    //   extended   - Boolean; Add `own` (aka non-inherited) property to result.
    //
    // This store *always* set `force` flag to true.
    //
    // If section has no direct settings for a usergroup, empty setting
    // values will be returned instead. Such values have the lowest priority,
    // so other stores can take advance.
    //
    get: function (keys, params, options, callback) {
      var self = this;

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
          callback('Forum section ' + params.forum_id + ' does not exist.');
          return;
        }

        var results = {};

        _.forEach(keys, function (settingName) {
          var settings = [];

          // Collect settings for given usergroups. Use empty values non-provided
          // settings to fallback to another store if possible.
          _.forEach(params.usergroup_ids, function (usergroupId) {
            if (!section.settings ||
                !section.settings.forum_usergroup ||
                !section.settings.forum_usergroup[usergroupId] ||
                !section.settings.forum_usergroup[usergroupId][settingName]) {

              // Use empty value instead.
              settings.push({
                value: self.getEmptyValue(settingName)
              , force: false
              });
              return;
            }

            var setting = section.settings.forum_usergroup[usergroupId][settingName];

            // For extended mode - get copy of whole setting object.
            // For normal mode - get copy of only value field.
            setting = options.extended ? _.clone(setting) : _.pick(setting, 'value');

            // This store always implies `force` option, but we don't keep it
            // in the database.
            setting.force = true;

            settings.push(setting);
          });

          // Get merged value.
          results[settingName] = N.settings.mergeValues(settings);
        });

        callback(null, results);
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
          callback('Forum section ' + params.forum_id + ' does not exist.');
          return;
        }

        if (!section.settings) {
          section.settings = {};
        }

        if (!section.settings.forum_usergroup) {
          section.settings.forum_usergroup = {};
        }

        if (!section.settings.forum_usergroup[params.usergroup_id]) {
          section.settings.forum_usergroup[params.usergroup_id] = {};
        }
 
        _.forEach(settings, function (setting, key) {
          if (null !== setting) {
            // NOTE: It's no need to put `force` flag into the database, since
            // this store always implies `force` at `Store#get`.
            section.settings.forum_usergroup[params.usergroup_id][key] = {
              value: setting.value
            , own:   true
            };
          } else {
            delete section.settings.forum_usergroup[params.usergroup_id][key];
          }
        });

        section.markModified('settings');
        section.save(function (err) {
          if (err) {
            callback(err);
            return;
          }

          self.updateInherited(section._id, callback);
        });
      });
    }
  });


  // Update inherited setting on all sections.
  //
  // `sectionId` is optional. If omitted - update all sections.
  //
  ForumUsergroupStore.updateInherited = function updateInherited(sectionId, callback) {
    var self = this;

    if (_.isFunction(sectionId)) {
      callback  = sectionId;
      sectionId = null;
    }

    N.models.forum.Section.find({}, function (err, allSections) {
      if (err) {
        callback(err);
        return;
      }


      // Collect flat list of section's descendants.
      //
      function selectSectionDescendants(parentId) {
        var result = [];

        var children = _.select(allSections, function (section) {
          // Universal way for equal check on: Null, ObjectId, and String.
          return String(section.parent || null) === String(parentId);
        });

        _.forEach(children, function (child) {
          result.push(child);
        });
        
        _.forEach(children, function (child) {
          _.forEach(selectSectionDescendants(child._id), function (grandchild) {
            result.push(grandchild);
          });
        });

        return result;
      }


      // Find first own setting by name for usergroup.
      //
      function findInheritedSetting(sectionId, usergroupId, settingName) {
        if (!sectionId) {
          return null;
        }

        var section = _.find(allSections, function (section) {
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


      // List of sections to recompute settings and save. All by default.
      var sectionsToUpdate = allSections;

      // If we want update only a subtree of sections,
      // collect different `sectionsToUpdate` list.
      if (sectionId) {
        var section = _.find(allSections, function (section) {
          // Universal way for equal check on: Null, ObjectId, and String.
          return String(section._id) === String(sectionId);
        });

        if (!section) {
          callback('Forum sections collection contains a reference to non-existent section %s');
          return;
        }

        sectionsToUpdate = [ section ].concat(selectSectionDescendants(section._id));
      }

      // Fetch list of all existent usergroup ids.
      N.models.users.UserGroup.find({}, '_id', { lean: true }, function (err, usergroups) {
        if (err) {
          callback(err);
          return;
        }

        async.forEach(sectionsToUpdate, function (section, next) {
          _.forEach(usergroups, function (usergroup) {
            _.forEach(self.keys, function (settingName) {
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

              var setting = findInheritedSetting(section.parent, usergroup._id, settingName);

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
            });
          });

          section.markModified('settings');
          section.save(next);
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
