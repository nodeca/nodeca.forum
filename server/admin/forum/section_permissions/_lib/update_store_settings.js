// Walks through all existent forum sections and remaps their
// interface state (raw_settings) into `forum_usergroup` settings store
// in consideration of section inheritance.


'use strict';


var _     = require('lodash');
var async = require('async');


module.exports = function updateStoreSettings(N, callback) {
  var store = N.settings.getStore('forum_usergroup');

  if (!store) {
    callback(new Error('Settings store `forum_usergroup` is not registered.'));
    return;
  }

  var defaultPermissions = {};

  _.forEach(store.keys, function (key) {
    defaultPermissions[key] = {
      value: store.getDefaultValue(key)
    , force: false
    };
  });

  N.models.forum.Section.find({}, '_id parent raw_settings.forum_usergroup', { lean: true }, function (err, sections) {
    if (err) {
      callback(err);
      return;
    }

    // Get full settings list for specified section
    // For inherited settings automatically extract values from parents
    function fetchSettings(sectionId, usergroupId) {
      var section, result;

      section = _.find(sections, function (section) {
        // Universal way for equal check on: Null, ObjectId, and String.
        return String(section._id) === String(sectionId);
      });

      if (!section) {
        N.logger.warn('Forum sections collection contains a reference to non-existent section %s', sectionId);
        return {};
      }

      // If parent section exists - fetch it's settings values first
      if (section.parent) {
        result = _.clone(fetchSettings(section.parent, usergroupId), true);
      } else {
        result = _.clone(defaultPermissions, true);
      }

      // Now override defaults with value of current section
      // (root one will have full list)
      if (section.raw_settings &&
          section.raw_settings.forum_usergroup &&
          section.raw_settings.forum_usergroup[usergroupId]) {
        _.extend(result, section.raw_settings.forum_usergroup[usergroupId]);
      }

      return result;
    }

    // Query list of all existent usergroup ids.
    N.models.users.UserGroup.find({}, '_id', { lean: true }, function (err, usergroups) {
      if (err) {
        callback(err);
        return;
      }

      async.forEach(sections, function (section, nextSection) {

        // NOTE: This *must* be a series to prevent full document overriding on
        // parallel write operations.
        async.forEachSeries(usergroups, function (usergroup, nextGroup) {

          // Write computed values into settings store.
          store.set(
            fetchSettings(section._id, usergroup._id)
          , { forum_id: section._id, usergroup_id: usergroup._id }
          , nextGroup
          );
        }, nextSection);
      }, callback);
    });
  });
};
