// Walks through all existent forum sections and:
//
// - Remaps their interface state (raw_settings) into `forum_moderator` settings
//   store in consideration of section inheritance.
//
// - Updates `moderator_list` and `moderator_id_list` fields.


'use strict';


var _        = require('lodash');
var async    = require('async');
var mongoose = require('mongoose');


module.exports = function updateModeratorsData(N, callback) {
  var store = N.settings.getStore('forum_moderator');

  if (!store) {
    callback(new Error('Settings store `forum_moderator` is not registered.'));
    return;
  }

  var defaultPermissions = {};

  _.forEach(store.keys, function (key) {
    defaultPermissions[key] = store.getDefaultValue(key);
  });

  N.models.forum.Section.find({}, function (err, sections) {
    if (err) {
      callback(err);
      return;
    }

    // Get full settings list for specified section
    // For inherited settings automatically extract values from parents
    function fetchSettings(sectionId) {
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
        result = _.clone(fetchSettings(section.parent), true);
      } else {
        result = {};
      }

      if (section.raw_settings && section.raw_settings.forum_moderator) {
        _.forEach(section.raw_settings.forum_moderator, function (settings, userId) {

          // Use default settings as bootstrap for root-level moderator records.
          result[userId] = result[userId] || _.clone(defaultPermissions, true);

          // Override inherited/default values with raw settings of current section.
          _.extend(result[userId], settings);
        });
      }

      return result;
    }

    // Process all sections.
    async.forEach(sections, function (section, next) {
      var settings     = fetchSettings(section._id)
        , moderatorIds = _(settings).keys().sort().map(mongoose.Types.ObjectId).valueOf();

      N.models.users.User
          .find().where('_id').in(moderatorIds)
          .select('_id id')
          .setOptions({ lean: true })
          .exec(function (err, users) {

        section.moderator_list_full = [];
        section.moderator_list      = [];
        section.moderator_id_list   = [];

        // Collect moderator lists.
        _.forEach(moderatorIds, function (moderatorId) {
          var user = _.find(users, function (user) {
            // Universal way for equal check on: Null, ObjectId, and String.
            return String(user._id) === String(moderatorId);
          });

          if (!user) {
            N.logger.warn('Forum section %s has a non-existent moderator %s', section._id, moderatorId);
            return;
          }

          section.moderator_list_full.push(user._id);

          // If it's visible moderator - add to "visible" lists.
          if (settings[moderatorId].forum_visible_moderator) {
            section.moderator_list.push(user._id);
            section.moderator_id_list.push(user.id);
          }
        });

        section.save(function (err) {
          if (err) {
            next(err);
            return;
          }

          store.set(settings, { forum_id: section._id }, next);
        });
      });
    }, callback);
  });
};
