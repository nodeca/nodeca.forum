// Per-section moderator setting store.
//
// Structure of the store:
//
//     SectionUsergroupStore:
//       _id: ...
//       section_id: ...
//       data:
//         user1_id:
//           setting1_key:
//             value: Mixed
//             own: Boolean
//

'use strict';


var _        = require('lodash');
var async    = require('async');
var memoizee = require('memoizee');
var format   = require('util').format;


module.exports = function (N) {

  // Helper to fetch moderators by IDs
  //
  function fetchSectionSettings(id, callback) {
    N.models.forum.SectionModeratorStore
      .findOne({ section_id: id })
      .lean(true)
      .exec(callback);
  }

  // Memoized version of `fetchSectionSettings` helper.
  // Revalidate cache after 30 seconds.
  //
  var fetchSectionSettingsCached = memoizee(fetchSectionSettings, {
    async:     true,
    maxAge:    30000,
    primitive: true
  });


  var SectionModeratorStore = N.settings.createStore({
    //
    // params:
    //   section_id - ObjectId
    //   user_id  - ObjectId
    //
    // options:
    //   skipCache  - Boolean
    //   extended   - Boolean; Add `own` (aka non-inherited) property to result.
    //
    // This store *always* set `force` flag to true.
    //
    // If section has no direct settings for the user, empty setting values
    // will be returned instead. Such values have the lowest priority, so
    // other stores can take advance.
    //
    get: function (keys, params, options, callback) {
      var self = this;

      if (!params.section_id) {
        callback('`section_id` parameter is required for getting settings from `section_moderator` store.');
        return;
      }

      if (!params.user_id) {
        callback('`user_id` parameter is required for getting settings from `section_moderator` store.');
        return;
      }

      var fetch = options.skipCache ? fetchSectionSettings : fetchSectionSettingsCached;

      fetch(params.section_id, function (err, section_settings) {
        if (err) {
          callback(err);
          return;
        }

        if (!section_settings) {
          callback(format('`section_moderator` store for forum section %s does not exist.', params.section_id));
          return;
        }

        var results = {};

        // Collect settings for the given user_id. Use empty values
        // non-provided settings to fallback to another store if possible.
        keys.forEach(function (settingName) {
          if (!section_settings.data ||
              !section_settings.data[params.user_id] ||
              !section_settings.data[params.user_id][settingName]) {

            // Use empty value instead.
            results[settingName] = {
              value: self.getEmptyValue(settingName),
              force: false
            };
            return;
          }

          var setting = section_settings.data[params.user_id][settingName];

          // For extended mode - get copy of whole setting object.
          // For normal mode - get copy of only value field.
          setting = options.extended ? _.clone(setting) : _.pick(setting, 'value');

          // This store always implies `force` option, but we don't keep it
          // in the database.
          setting.force = true;

          results[settingName] = setting;
        });

        callback(null, results);
      });
    },

    //
    // params:
    //   section_id - ObjectId
    //   user_id  - ObjectId
    //
    set: function (settings, params, callback) {
      var self = this;

      if (!params.section_id) {
        callback('`section_id` parameter is required for saving settings into `section_moderator` store.');
        return;
      }

      if (!params.user_id) {
        callback('`user_id` parameter required for saving settings into `section_moderator` store.');
        return;
      }

      N.models.forum.SectionModeratorStore
          .findOne({ section_id: params.section_id })
          .exec(function (err, section_settings) {

        if (err) {
          callback(err);
          return;
        }

        if (!section_settings) {
          callback(format('`section_moderator` store for forum section %s does not exist.', params.section_id));
          return;
        }

        var user_settings = section_settings[params.user_id] || {};

        Object.keys(settings).forEach(function (key) {
          var setting = settings[key];

          if (setting !== null) {
            // NOTE: It's no need to put `force` flag into the database, since
            // this store always implies `force` at `Store#get`.
            user_settings[key] = {
              value: setting.value,
              own:   true
            };
          } else {
            delete user_settings[key];
          }
        });

        if (_.isEmpty(user_settings)) {
          // Drop empty moderator entries.
          delete section_settings.data[params.user_id];
        } else {
          section_settings.data[params.user_id] = user_settings;
        }

        section_settings.markModified('data');

        section_settings.save(function (err) {
          if (err) {
            callback(err);
            return;
          }

          self.updateInherited(params.section_id, callback);
        });
      });
    }
  });


  // Collect list of section moderators with statistics. (both own and inherited)
  // NOTE: This function only returns statistics information; no real settings.
  //
  // Result example:
  //   [
  //     {
  //       _id: '51f0835b0798894c2f000006',  // user id
  //       own: 1,       // count of changed settings done in this section
  //       inherited: 3  // count of changed settings inherited from parent section
  //     },
  //     { ... }
  //   ]
  //
  SectionModeratorStore.getModeratorsInfo = function getModeratorsInfo(sectionId, callback) {
    fetchSectionSettings(sectionId, function (err, section_settings) {
      if (err) {
        callback(err);
        return;
      }

      if (!section_settings) {
        callback(format('`section_moderator` store for forum section %s does not exist.', sectionId));
        return;
      }

      var result = [];

      if (section_settings.data) {
        Object.keys(section_settings.data).forEach(function (userId) {
          result.push({
            _id:       userId,
            own:       _.filter(section_settings.data[userId], { own: true  }).length,
            inherited: _.filter(section_settings.data[userId], { own: false }).length
          });
        });
      }

      // Sort moderators by ObjectId.
      callback(null, _.sortBy(result, function (moderator) {
        return String(moderator._id);
      }));
    });
  };


  // Update inherited setting on all sections.
  //
  // `sectionId` is optional. If omitted - update all sections.
  //
  SectionModeratorStore.updateInherited = function updateInherited(sectionId, callback) {
    var self = this;

    if (_.isFunction(sectionId)) {
      callback  = sectionId;
      sectionId = null;
    }

    N.models.forum.Section.find({})
        .select('_id parent moderators')
        .exec(function (err, allSections) {

      if (err) {
        callback(err);
        return;
      }

      N.models.forum.SectionModeratorStore.find({}, function (err, allSettings) {
        if (err) {
          callback(err);
          return;
        }

        // Get section from allSections array by its id
        //
        function getSectionById(id) {
          return allSections.filter(function (section) {
            // Universal way for equal check on: Null, ObjectId, and String.
            return String(section._id) === String(id);
          })[0];
        }

        // Get section settings from allSettings array by section id
        //
        function getSettingsBySectionId(id) {
          return allSettings.filter(function (s) {
            // Universal way for equal check on: Null, ObjectId, and String.
            return String(id) === String(s.section_id);
          })[0];
        }


        // Collect flat list of section's descendants.
        //
        function selectSectionDescendants(parentId) {
          var result = [];

          var children = allSections.filter(function (section) {
            // Universal way for equal check on: Null, ObjectId, and String.
            return String(section.parent || null) === String(parentId);
          });

          children.forEach(function (child) {
            result.push(child);
          });

          children.forEach(function (child) {
            selectSectionDescendants(child._id).forEach(function (grandchild) {
              result.push(grandchild);
            });
          });

          return result;
        }


        // Find first own setting by name for moderator.
        //
        function findInheritedSetting(sectionId, userId, settingName) {
          if (!sectionId) {
            return null;
          }

          var sect = getSectionById(sectionId);
          if (!sect) {
            N.logger.warn('Forum sections collection contains a reference to non-existent section %s', sectionId);
            return null;
          }

          var section_settings = getSettingsBySectionId(sectionId);
          if (!section_settings) {
            N.logger.warn('`section_moderator` store for forum section %s does not exist.', sectionId);
            return null;
          }

          var user_settings = section_settings.data[userId] || {};

          // Setting exists, and it is not inherited from another section.
          if (user_settings[settingName] &&
              user_settings[settingName].own) {
            return user_settings[settingName];
          }

          // Recursively walk through ancestors sequence.
          if (sect.parent) {
            return findInheritedSetting(sect.parent, userId, settingName);
          }

          return null;
        }


        // Collect flat list of unique moderator ids on given section
        // and all ancestor sections.
        //
        function collectModeratorIds(sectionId) {
          if (!sectionId) {
            return [];
          }

          var sect = getSectionById(sectionId);
          if (!sect) {
            N.logger.warn('Forum sections collection contains a reference to non-existent section %s', sectionId);
            return [];
          }

          var section_settings = getSettingsBySectionId(sectionId);
          if (!section_settings) {
            N.logger.warn('`section_moderator` store for forum section %s does not exist.', sectionId);
            return [];
          }

          if (section_settings.data) {
            return _.uniq(_.keys(section_settings.data).concat(collectModeratorIds(sect.parent)));
          }
          return collectModeratorIds(sect.parent);
        }


        // List of sections to recompute settings and save. All by default.
        var sectionsToUpdate = allSections;

        // If we want update only a subtree of sections,
        // collect different `sectionsToUpdate` list.
        if (sectionId) {
          var section = getSectionById(sectionId);
          if (!section) {
            callback(format('Forum sections collection contains a reference to non-existent section %s', sectionId));
            return;
          }

          sectionsToUpdate = [ section ].concat(selectSectionDescendants(section._id));
        }

        async.each(sectionsToUpdate, function (section, next) {

          var section_settings = getSettingsBySectionId(section._id);
          if (!section_settings) {
            N.logger.warn('`section_moderator` store for forum section %s does not exist.', sectionId);
            return next();
          }

          // Collect all moderators (both own and inherited) for current section.
          var allModeratorIds = collectModeratorIds(section._id);

          // Inherit new/updated and drop deprecated settings for all moderators.
          allModeratorIds.forEach(function (userId) {
            var user_settings = section_settings.data[userId] || {};

            self.keys.forEach(function (settingName) {
              // Do not touch own settings. We only update inherited settings.
              if (user_settings[settingName] &&
                  user_settings[settingName].own) {
                return;
              }

              var setting = findInheritedSetting(section.parent, userId, settingName);

              if (setting) {
                // Set/update inherited setting.
                user_settings[settingName] = {
                  value: setting.value,
                  own:   false
                };
              } else {
                // Drop deprecated inherited setting.
                delete user_settings[settingName];
              }
            });

            if (_.isEmpty(user_settings)) {
              // Drop empty moderator entries.
              delete section_settings.data[userId];
            } else {
              section_settings.data[userId] = user_settings;
            }

            section_settings.markModified('data');
          });


          // Select publicly visible moderators to update `moderators`
          var visibleModeratorIds = allModeratorIds.filter(function (userId) {
            return section_settings.data[userId] &&
                   section_settings.data[userId].forum_mod_visible &&
                   section_settings.data[userId].forum_mod_visible.value;
          });

          section_settings.save(function (err) {
            if (err) {
              next(err);
              return;
            }

            section.moderators    = visibleModeratorIds;
            section.save(next);
          });

        }, callback);
      });
    });
  };


  // Remove single moderator entry at section.
  //
  SectionModeratorStore.removeModerator = function removeModerator(sectionId, userId, callback) {
    var self = this;

    N.models.forum.SectionModeratorStore.findOne({ section_id: sectionId }, function (err, section_settings) {
      if (err) {
        callback(err);
        return;
      }

      if (!section_settings) {
        callback(format('Forum section %s does not exist.', sectionId));
        return;
      }

      var user_settings = section_settings.data[userId];

      if (!user_settings) {
        callback();
        return;
      }

      delete section_settings.data[userId];
      section_settings.markModified('data');

      section_settings.save(function (err) {
        if (err) {
          callback(err);
          return;
        }

        self.updateInherited(sectionId, callback);
      });
    });
  };


  return SectionModeratorStore;
};
