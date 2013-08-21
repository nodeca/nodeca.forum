// Show edit form for forum moderator.


'use strict';


var async = require('async');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    section_id: { format: 'mongo', required: true }
  , user_id:    { format: 'mongo', required: true }
  });


  N.wire.before(apiPath, function setting_stores_check() {
    if (!N.settings.getStore('section_moderator')) {
      return {
        code:    N.io.APP_ERROR
      , message: 'Settings store `section_moderator` is not registered.'
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


  N.wire.before(apiPath, function user_fetch(env, callback) {
    N.models.users.User
        .findById(env.params.user_id)
        .setOptions({ lean: true })
        .exec(function (err, user) {

      if (err) {
        callback(err);
        return;
      }

      if (!user) {
        callback(N.io.NOT_FOUND);
        return;
      }

      env.data.user = user;
      callback();
    });
  });


  N.wire.on(apiPath, function group_permissions_edit(env, callback) {
    var SectionModeratorStore = N.settings.getStore('section_moderator')
      , UsergroupStore      = N.settings.getStore('usergroup');

    // Setting schemas to build client interface.
    env.res.setting_schemas = N.config.setting_schemas.section_moderator;

    // Expose moderator's full name.
    env.res.moderator_name = env.data.user.name;

    async.parallel([
      //
      // Fetch settings with inheritance info for current edit section.
      //
      function (next) {
        SectionModeratorStore.get(
          SectionModeratorStore.keys
        , { section_id: env.data.section._id, user_id: env.data.user._id }
        , { skipCache: true, extended: true }
        , function (err, editSettings) {
          env.res.settings = editSettings;
          next(err);
        });
      }
      //
      // Fetch inherited settings from section's parent.
      //
    , function (next) {
        if (!env.data.section.parent) {
          env.res.parent_settings = null;
          next();
          return;
        }

        SectionModeratorStore.get(
          SectionModeratorStore.keys
        , { section_id: env.data.section.parent, user_id: env.data.user._id }
        , { skipCache: true, extended: true }
        , function (err, parentSettings) {
          env.res.parent_settings = parentSettings;
          next(err);
        });
      }
      //
      // Fetch inherited settings from usergroup.
      //
    , function (next) {
        UsergroupStore.get(
          UsergroupStore.keys
        , { usergroup_ids: env.data.user.usergroups }
        , { skipCache: true }
        , function (err, usergroupSettings) {
          env.res.usergroup_settings = usergroupSettings;
          next(err);
        });
      }
    ], callback);
  });


  N.wire.after(apiPath, function title_set(env) {
    env.res.head.title = env.t('title', { section: env.data.section.title });
  });
};
