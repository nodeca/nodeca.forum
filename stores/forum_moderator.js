'use strict';


var _        = require('lodash');
var memoizee = require('memoizee');


module.exports = function (N) {

  // Helper to fetch usergroups by IDs
  //
  function fetchSectionSettings(id, callback) {
    N.models.forum.Section
      .findById(id)
      .select('settings.forum_moderator')
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


  var ForumModeratorStore = N.settings.createStore({
    //
    // params:
    //   forum_id  - ObjectId
    //   user_id   - ObjectId
    //
    // options:
    //   skipCache - Boolean
    //
    get: function (keys, params, options, callback) {
      if (!params.forum_id) {
        callback('`forum_id` parameter is required for getting settings from `forum_moderator` store.');
        return;
      }

      if (!params.user_id) {
        callback('`user_id` parameter is required for getting settings from `forum_moderator` store.');
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

        _.forEach(keys, function (key) {
          if (section.settings &&
              section.settings.forum_moderator &&
              section.settings.forum_moderator[params.user_id] &&
              _.has(section.settings.forum_moderator[params.user_id], key)) {
            results[key] = {
              value: section.settings.forum_moderator[params.user_id][key]
            , force: false
            };
          }
        });

        callback(null, (!_.isEmpty(results) ? results : null));
      });
    }
    //
    // params:
    //   forum_id - ObjectId
    //
  , set: function (settings, params, callback) {
      if (!params.forum_id) {
        callback('`forum_id` parameter is required for getting settings from `forum_moderator` store.');
        return;
      }

      N.models.forum.Section.findById(params.forum_id, function (err, section) {
        if (err) {
          callback(err);
          return;
        }

        if (!section) {
          callback('Forum section `' + params.forum_id + '` not exists.');
          return;
        }

        section.settings = section.settings || {};
        section.settings.forum_moderator = settings;
        section.markModified('settings.forum_moderator');
        section.save(callback);
      });
    }
  , validate: function (data) {
      if (!_.isObject(data)) {
        throw '`forum_moderator` input data must be an object like: { user_id: settings }';
      }

      _.forEach(data, function (settings) {
        if (!_.isObject(settings)) {
          throw '`forum_moderator` settings must be a key-value hash.';
        }

        _.forEach(settings, function (value, key) {
          var err = this.validateSetting(key, value);

          if (null !== err) {
            throw err;
          }
        }, this);
      }, this);
    }
  });

  return ForumModeratorStore;
};
