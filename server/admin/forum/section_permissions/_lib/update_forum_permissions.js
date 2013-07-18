// Walks through all existent forum sections and do:
// - Normalize raw settings. (intermediate storage for admin interface state)
// - Resolve settings inheritance.
// - Write raw settings to the settings store.


'use strict';


var _     = require('lodash');
var async = require('async');


module.exports = function updateStoreSettings(N, callback) {
  var store = N.settings.getStore('forum_usergroup');

  if (!store) {
    callback(new Error('Settings store `forum_usergroup` is not registered.'));
    return;
  }

  // NOTE: Sorting by level is important! It guarantees that parent sections
  // will be normalized before their descendants. So settings inheritance will
  // be resolved correctly.
  N.models.forum.Section.find().sort('level').exec(function (err, sections) {
    if (err) {
      callback(err);
      return;
    }

    // Find first overriden raw setting by name for usergroup.
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
      if (_.isObject(section.raw_settings) &&
          _.isObject(section.raw_settings.forum_usergroup) &&
          _.isObject(section.raw_settings.forum_usergroup[usergroupId]) &&
          _.isObject(section.raw_settings.forum_usergroup[usergroupId][settingName]) &&
          section.raw_settings.forum_usergroup[usergroupId][settingName].overriden) {
        return section.raw_settings.forum_usergroup[usergroupId][settingName];
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

      async.forEach(sections, function (section, nextSection) {
        //
        // Normalize raw settings.
        //
        if (!_.isObject(section.raw_settings)) {
          section.raw_settings = {};
          section.markModified('raw_settings');
        }

        if (!_.isObject(section.raw_settings.forum_usergroup)) {
          section.raw_settings.forum_usergroup = {};
          section.markModified('raw_settings.forum_usergroup');
        }

        _.forEach(usergroups, function (usergroup) {
          if (!_.isObject(section.raw_settings.forum_usergroup[usergroup._id])) {
            section.raw_settings.forum_usergroup[usergroup._id] = {};
            section.markModified('raw_settings.forum_usergroup');
          }

          _.forEach(store.keys, function (key) {
            if (!_.isObject(section.raw_settings.forum_usergroup[usergroup._id][key])) {
              section.raw_settings.forum_usergroup[usergroup._id][key] = {};
              section.markModified('raw_settings.forum_usergroup');
            }

            // Compute non-overriden setting.
            if (!section.raw_settings.forum_usergroup[usergroup._id][key].overriden) {
              var setting = findInheritedSetting(section.parent, usergroup._id, key);

              section.raw_settings.forum_usergroup[usergroup._id][key] = {
                value:     setting ? setting.value : store.getDefaultValue(key)
              , force:     setting ? setting.force : false
              , overriden: !section.parent // Always mark root settings as "overriden".
              };
              section.markModified('raw_settings.forum_usergroup');
            }
          });
        });

        async.series([
          //
          // Save section into database if it's modified.
          //
          function (nextStep) {
            if (section.isModified()) {
              section.save(nextStep);
            } else {
              nextStep();
            }
          }
          //
          // Write computed values into settings store.
          //
        , function (nextStep) {
            var settings = {};

            // Remap raw settings format to store settings format.
            _.forEach(section.raw_settings.forum_usergroup, function (usergroupSettings, usergroupId) {
              settings[usergroupId] = {};

              _.forEach(usergroupSettings, function (setting, key) {
                settings[usergroupId][key] = {
                  value: setting.value
                , force: setting.force
                };
              });
            });

            store.set(settings, { forum_id: section._id }, nextStep);
          }
        ], nextSection);
      }, callback);
    });
  });
};
