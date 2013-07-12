// Show edit form for per-usergroup permissions on a forum section.


'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    section_id:   { type: 'string', required: true }
  , usergroup_id: { type: 'string', required: true }
  });

  N.wire.on(apiPath, function section_index(env, callback) {
    var store = N.settings.getStore('forum_usergroup');

    if (!store) {
      callback({
        code:    N.io.APP_ERROR
      , message: 'Settings store `forum_usergroup` is not registered.'
      });
      return;
    }

    N.models.forum.Section
        .findById(env.params.section_id)
        .select('_id title parent raw_settings.forum_usergroup')
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

        // Overriden settings.
        if (section.raw_settings &&
            section.raw_settings.forum_usergroup &&
            section.raw_settings.forum_usergroup[usergroup._id]) {
          env.response.data.settings = section.raw_settings.forum_usergroup[usergroup._id];
        } else {
          env.response.data.settings = {};
        }

        // If section has no parent - it's done. Skip further operations.
        if (!section.parent) {
          env.response.data.parent_settings = null;
          callback();
          return;
        }

        // Settings which can be inherited from section's parent.
        store.get(
          store.keys
        , { forum_id: section.parent, usergroup_ids: [ usergroup._id ] }
        , { skipCache: true }
        , function (err, settings) {

          if (err) {
            callback(err);
            return;
          }

          env.response.data.parent_settings = settings;
          callback();
        });
      });
    });
  });
};
