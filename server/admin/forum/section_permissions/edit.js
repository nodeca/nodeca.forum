// Show edit form for per-usergroup permissions on a forum section.


'use strict';


var async = require('async');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    section_id:   { type: 'string', required: true }
  , usergroup_id: { type: 'string', required: true }
  });

  N.wire.on(apiPath, function section_permissions_edit(env, callback) {
    var ForumUsergroupStore = N.settings.getStore('forum_usergroup');

    if (!ForumUsergroupStore) {
      callback({ code: N.io.APP_ERROR, message: 'Settings store `forum_usergroup` is not registered.' });
      return;
    }

    var UsergroupStore = N.settings.getStore('usergroup');

    if (!UsergroupStore) {
      callback({ code: N.io.APP_ERROR, message: 'Settings store `usergroup` is not registered.' });
      return;
    }

    N.models.forum.Section
        .findById(env.params.section_id)
        .select('_id title parent')
        .setOptions({ lean: true })
        .exec(function (err, section) {

      if (err) {
        callback(err);
        return;
      }

      if (!section) {
        callback(N.io.NOT_FOUND);
        return;
      }

      N.models.users.UserGroup
          .findById(env.params.usergroup_id)
          .select('_id short_name')
          .setOptions({ lean: true })
          .exec(function (err, usergroup) {

        if (err) {
          callback(err);
          return;
        }

        if (!usergroup) {
          callback(N.io.NOT_FOUND);
          return;
        }

        // Translation path for usergroup name.
        var usergroupI18n = '@admin.users.usergroup_names.' + usergroup.short_name;

        env.response.data.head.title = env.t('title', {
          section:   section.title
        , usergroup: env.t.exists(usergroupI18n) ? env.t(usergroupI18n) : usergroup.short_name
        });

        // Setting schemas to build client interface.
        env.response.data.setting_schemas = N.config.setting_schemas.forum_usergroup;

        async.parallel([
          //
          // Fetch settings with inheritace info for current edit section.
          //
          function (next) {
            ForumUsergroupStore.get(
              ForumUsergroupStore.keys
            , { forum_id: section._id, usergroup_ids: [ usergroup._id ] }
            , { skipCache: true, verbose: true }
            , function (err, editSettings) {
              env.response.data.settings = editSettings;
              next(err);
            });
          }
          //
          // Fetch inherited settings from section's parent.
          //
        , function (next) {
            if (!section.parent) {
              env.response.data.parent_settings = null;
              next();
              return;
            }

            ForumUsergroupStore.get(
              ForumUsergroupStore.keys
            , { forum_id: section.parent, usergroup_ids: [ usergroup._id ] }
            , { skipCache: true }
            , function (err, parentSettings) {
              env.response.data.parent_settings = parentSettings;
              next(err);
            });
          }
          //
          // Fetch inherited settings from usergroup.
          //
        , function (next) {
            UsergroupStore.get(
              UsergroupStore.keys
            , { usergroup_ids: [ usergroup._id ] }
            , { skipCache: true }
            , function (err, usergroupSettings) {
              env.response.data.usergroup_settings = usergroupSettings;
              next(err);
            });
          }
        ], callback);
      });
    });
  });
};
