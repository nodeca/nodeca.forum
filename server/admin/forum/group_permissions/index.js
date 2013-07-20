// Show tree of forum sections with usergroup permissions info.


'use strict';


var _     = require('lodash');
var async = require('async');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});

  N.wire.on(apiPath, function group_permissions_index(env, callback) {
    var ForumUsergroupStore = N.settings.getStore('forum_usergroup');

    if (!ForumUsergroupStore) {
      callback({ code: N.io.APP_ERROR, message: 'Settings store `forum_usergroup` is not registered.' });
      return;
    }

    env.response.data.head.title     = env.t('title');
    env.response.data.settings_total = ForumUsergroupStore.keys.length;

    // Collect usergroups info.
    N.models.users.UserGroup
        .find()
        .select('_id short_name')
        .sort('_id')
        .setOptions({ lean: true })
        .exec(function (err, usergroups) {

      if (err) {
        callback(err);
        return;
      }

      // Set localized name for each section.
      _.forEach(usergroups, function (usergroup) {
        var i18n = '@admin.users.usergroup_names.' + usergroup.short_name;
        usergroup.localized_name = env.t.exists(i18n) ? env.t(i18n) : usergroup.short_name;
      });

      env.response.data.usergroups = usergroups;

      // Collect sections tree.
      N.models.forum.Section
          .find()
          .select('_id title parent')
          .sort('display_order')
          .setOptions({ lean: true })
          .exec(function (err, sections) {

        if (err) {
          callback(err);
          return;
        }

        // Set count of overriden settings for each section/usergroup.
        async.forEach(sections, function (section, nextSection) {
          section.overriden = {};

          async.forEach(usergroups, function (usergroup, nextGroup) {
            ForumUsergroupStore.get(
              ForumUsergroupStore.keys
            , { forum_id: section._id, usergroup_ids: [ usergroup._id ] }
            , { skipCache: true, verbose: true }
            , function (err, settings) {
              if (err) {
                nextGroup(err);
                return;
              }

              section.overriden[usergroup._id] = 0;

              _.forEach(settings, function (setting) {
                if (setting.own) {
                  section.overriden[usergroup._id] += 1;
                }
              });

              nextGroup();
            });
          }, nextSection);
        }, function (err) {
          if (err) {
            callback(err);
            return;
          }

          function collectSectionsTree(parent) {
            var selectedSections = _.select(sections, function (section) {
              // Universal way for equal check on: Null, ObjectId, and String.
              return String(section.parent || null) === String(parent);
            });

            // Collect children subtree for each section.
            _.forEach(selectedSections, function (section) {
              section.children = collectSectionsTree(section._id);
            });

            return selectedSections;
          }

          env.response.data.sections = collectSectionsTree(null);
          callback();
        });
      });
    });
  });
};
