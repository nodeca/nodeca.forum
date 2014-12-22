'use strict';

var _     = require('lodash');
var async = require('async');
var updateStoreSettings = require('nodeca.users/server/admin/users/usergroups/_lib/update_store_settings');

module.exports.up = function (N, cb) {
  var models = N.models;

  async.series([
    //add usergroup settings for admin
    function (callback) {
      models.users.UserGroup.findOne({ short_name: 'administrators' })

        .exec(function (err, group) {
          if (err) {
            callback(err);
            return;
          }

          group.raw_settings = _.assign({}, group.raw_settings, {
            forum_can_reply: { value: true },
            forum_can_start_topics: { value: true },
            forum_mod_can_pin_topic: { value: true },
            forum_mod_can_edit_posts: { value: true },
            forum_mod_can_delete_topics: { value: true },
            forum_mod_can_edit_titles: { value: true },
            forum_mod_can_close_topic: { value: true },
            forum_mod_can_hard_delete_topics: { value: true },
            forum_mod_can_see_hard_deleted_topics: { value: true }
          });
          group.save(callback);
        });
    },

    // add usergroup settings for member
    function (callback) {
      models.users.UserGroup.findOne({ short_name: 'members' })
        .exec(function (err, group) {

          if (err) {
            callback(err);
            return;
          }

          group.raw_settings = _.assign({}, group.raw_settings, {
            forum_can_reply: { value: true },
            forum_can_start_topics: { value: true }
          });
          group.save(callback);
        });
    },

    // Recalculate store settings of all groups.
    function (callback) {
      updateStoreSettings(N, callback);
    }
  ], cb);
};
