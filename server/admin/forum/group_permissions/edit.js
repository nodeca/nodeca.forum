// Show edit form for per-usergroup permissions on a forum section.


'use strict';


var async = require('async');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    section_id:   { type: 'string', required: true }
  , usergroup_id: { type: 'string', required: true }
  });


  N.wire.before(apiPath, function setting_stores_check() {
    if (!N.settings.getStore('forum_usergroup')) {
      return {
        code:    N.io.APP_ERROR
      , message: 'Settings store `forum_usergroup` is not registered.'
      };
    }

    if (!N.settings.getStore('usergroup')) {
      return {
        code:    N.io.APP_ERROR
      , message: 'Settings store `usergroup` is not registered.'
      };
    }
  });


  N.wire.before(apiPath, function section_fetch(env, callback) {
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

      env.data.section = section;
      callback();
    });
  });


  N.wire.before(apiPath, function usergroup_fetch(env, callback) {
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

      env.data.usergroup = usergroup;
      callback();
    });
  });


  N.wire.on(apiPath, function group_permissions_edit(env, callback) {
    var ForumUsergroupStore = N.settings.getStore('forum_usergroup')
      , UsergroupStore      = N.settings.getStore('usergroup');

    // Setting schemas to build client interface.
    env.response.data.setting_schemas = N.config.setting_schemas.forum_usergroup;

    async.parallel([
      //
      // Fetch settings with inheritance info for current edit section.
      //
      function (next) {
        ForumUsergroupStore.get(
          ForumUsergroupStore.keys
        , { forum_id: env.data.section._id, usergroup_ids: [ env.data.usergroup._id ] }
        , { skipCache: true, extended: true, allowHoles: true }
        , function (err, editSettings) {
          env.response.data.settings = editSettings;
          next(err);
        });
      }
      //
      // Fetch inherited settings from section's parent.
      //
    , function (next) {
        if (!env.data.section.parent) {
          env.response.data.parent_settings = null;
          next();
          return;
        }

        ForumUsergroupStore.get(
          ForumUsergroupStore.keys
        , { forum_id: env.data.section.parent, usergroup_ids: [ env.data.usergroup._id ] }
        , { skipCache: true, allowHoles: true }
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
        , { usergroup_ids: [ env.data.usergroup._id ] }
        , { skipCache: true }
        , function (err, usergroupSettings) {
          env.response.data.usergroup_settings = usergroupSettings;
          next(err);
        });
      }
    ], callback);
  });


  N.wire.after(apiPath, function title_set(env) {
    // Translation path for usergroup name.
    var usergroupI18n = '@admin.users.usergroup_names.' + env.data.usergroup.short_name;

    env.response.data.head.title = env.t('title', {
      section:   env.data.section.title
    , usergroup: env.t.exists(usergroupI18n) ? env.t(usergroupI18n) : env.data.usergroup.short_name
    });
  });
};
