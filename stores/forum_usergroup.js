'use strict';


/*global nodeca, _*/


// 3rd-party
var Store = require('nlib').Settings.Store;
var async = require('nlib').Vendor.Async;


////////////////////////////////////////////////////////////////////////////////


// Helper to fetch usergroups by IDs
//
function fetchForumSettings(id, callback) {
  nodeca.models.forum.Section.findOne({ _id: id })
    .select('settings')
    .exec(callback);
}


// Memoized version of fetchUserGroups helper
//
var fetchForumSesstingsCached = nodeca.components.memoizee(fetchForumSettings, {
  // momoizee options. revalidate cache after 30 sec
  async:  true,
  maxAge: 30000
});


////////////////////////////////////////////////////////////////////////////////


module.exports = new Store({
  get: function (keys, params, options, callback) {
    var self = this;
    var func = options.skipCache ? fetchForumSettings : fetchForumSesstingsCached;

    func(params.forum_id, function (err, forum) {
      if (err) {
        callback(err);
        return;
      }

      var settings  = forum.settings || {};
      var results   = {};

      try {
        keys.forEach(function (k) {
          var values = [];

          params.usergroup_ids.forEach(function (id) {
            if (settings[k + ':usergroup:' + id]) {
              values.push(settings[k + ':usergroup:' + id]);
            }
          });

          // push default value
          values.push({ value: self.getDefaultValue(k) });

          results[k] = Store.mergeValues(values);
        });
      } catch (err) {
        callback(err);
        return;
      }

      callback(null, results);
    });
  },
  set: function (values, params, callback) {
    var self = this;

    fetchForumSettings(params.forum_id, function (err, forum) {
      if (err) {
        callback(err);
        return;
      }

      // leave only those params, that we know about
      values = _.pick(values || {}, self.keys);

      forum.settings = forum.settings || {};

      params.usergroup_ids.forEach(function (id) {
        _.each(values, function (opts, key) {
          forum.settings[key + ':usergroup:' + id] = {
            value: opts.value,
            force: !!opts.value
          };
        });
      });

      forum.markModified('settings');
      forum.save(callback);
    });
  }
});
