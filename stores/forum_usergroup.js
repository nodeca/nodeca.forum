'use strict';


var _     = require('lodash');
var memoizee = require('memoizee');


////////////////////////////////////////////////////////////////////////////////

module.exports = function (N) {

  // Helper to fetch usergroups by IDs
  //
  function fetchForumSettings(id, callback) {
    N.models.forum.Section.findOne({ _id: String(id) })
      .select('settings.forum_usergroup')
      .setOptions({ lean: true })
      .exec(callback);
  }

  // Memoized version of fetchUserGroups helper
  //
  var fetchForumSettingsCached = memoizee(fetchForumSettings, {
    // memoizee options. revalidate cache after 30 sec
    async:      true,
    maxAge:     30000,
    primitive:  true
  });


  ////////////////////////////////////////////////////////////////////////////////


  // ##### Params
  //
  // - usergroup_ids (Array)
  // - forum_id (String|ObjectId)
  //
  var ForumGroupStore = N.settings.createStore({
    get: function (keys, params, options, callback) {
      var func = options.skipCache ? fetchForumSettings : fetchForumSettingsCached;

      if (!params.forum_id) {
        callback("forum_id param is required for getting settings from forum_usergroup store");
        return;
      }

      if (!_.isArray(params.usergroup_ids) || !params.usergroup_ids.length) {
        callback("usergroup_ids param required to be non-empty array for getting settings from forum_usergroup store");
        return;
      }

      func(params.forum_id, function (err, forum) {
        var settings, results = {};

        if (err) {
          callback(err);
          return;
        }

        settings = forum.settings || {};
        settings = settings.forum_usergroup  || {};

        keys.forEach(function (k) {
          var values = [];

          params.usergroup_ids.forEach(function (id) {
            if (settings[id]) {
              values.push(settings[id]);
            } else {
              values.push(null);
            }
          });

          results[k] = N.settings.mergeValues(values);
        });

        callback(null, results);
      });
    },

    set: function (settings, params, callback) {
      if (!params.forum_id) {
        callback("forum_id param is required for saving settings into forum_usergroup store");
        return;
      }

      if (!params.usergroup_id) {
        callback("usergroup_id param is required for saving settings into forum_usergroup store");
        return;
      }

      N.models.forum.Section.findOne({
        _id: params.forum_id
      }).exec(function (err, forum) {
        var grp_id = params.usergroup_id;

        if (err) {
          callback(err);
          return;
        }

        // make sure we have settings storages
        forum.settings = forum.settings || {};
        forum.settings.forum_usergroup = forum.settings.forum_usergroup || {};
        forum.settings.forum_usergroup[grp_id] = forum.settings.forum_usergroup[grp_id] || {};

        _.each(settings, function (opts, key) {
          if (null === opts) {
            delete forum.settings.forum_usergroup[grp_id][key];
          } else {
            forum.settings.forum_usergroup[grp_id][key] = opts;
          }
        });

        forum.markModified('settings');
        forum.save(callback);
      });
    }
  });

  return ForumGroupStore;
};
