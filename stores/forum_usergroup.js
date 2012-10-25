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


var ForumUserGroupStore = new Store({
  get: function (key, params, options, callback) {
    var func = options.skipCache ? fetchForumSettings : fetchForumSesstingsCached;

    func(params.forum_id, function (err, forum) {
      if (err) {
        callback(err);
        return;
      }

      var settings  = forum.settings || {};
      var values    = [];

      params.usergroup_ids.forEach(function (id) {
        if (settings[key + ':usergroup:' + id]) {
          values.push(settings[key + ':usergroup:' + id]);
        }
      });

      // push default value
      values.push({ value: ForumUserGroupStore.getDefaultValue(key) });

      var result;

      try {
        result = Store.mergeValues(values);
      } catch (err) {
        callback(err);
        return;
      }

      callback(null, result);
    });
  },
  set: function (values, params, callback) {
    fetchForumSettings(params.forum_id, function (err, forum) {
      if (err) {
        callback(err);
        return;
      }

      // leave only those params, that we know about
      values = _.pick(values || {}, ForumUserGroupStore.keys);

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
  },
  params: {
    usergroup_ids: {
      type: 'array',
      required: true,
      minItems: 1
    },
    forum_id: {
      type: 'string',
      required: true
    }
  }
});


////////////////////////////////////////////////////////////////////////////////


module.exports = ForumUserGroupStore;
