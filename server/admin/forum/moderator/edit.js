'use strict';


var _ = require('lodash');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    section_id: { type: 'string', required: true }
  , user_id:    { type: 'string', required: true }
  });

  N.wire.on(apiPath, function moderator_edit(env, callback) {
    var store = N.settings.getStore('forum_moderator');

    if (!store) {
      callback({
        code:    N.io.APP_ERROR
      , message: 'Settings store `forum_moderator` is not registered.'
      });
      return;
    }

    N.models.forum.Section
        .findById(env.params.section_id)
        .select('_id title parent moderator_list_full raw_settings.forum_moderator')
        .exec(function (err, section) {

      if (err) {
        callback(err);
        return;
      }

      if (!section) {
        callback(N.io.NOT_FOUND);
        return;
      }

      N.models.users.User
          .findById(env.params.user_id)
          .select('_id _uname')
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

        // No such moderator on this section.
        if (-1 === section.moderator_list_full.indexOf(user._id)) {
          callback(N.io.NOT_FOUND);
          return;
        }

        env.response.data.head.title = env.t('title', {
          section: section.title
        , user:    user._uname
        });

        env.response.data.section_id = section._id;
        env.response.data.user_id    = user._id;

        // Setting schemas to build client interface.
        env.response.data.setting_schemas = N.config.setting_schemas.forum_moderator;

        // Overriden settings.
        if (section.raw_settings &&
            section.raw_settings.forum_moderator &&
            section.raw_settings.forum_moderator[user._id]) {
          env.response.data.settings = section.raw_settings.forum_moderator[user._id];
        } else {
          env.response.data.settings = {};
        }

        // If section has no parent - it's done. Skip further operations.
        if (!section.parent) {
          env.response.data.is_inherited = false;
          env.response.data.parent_settings = null;
          callback();
          return;
        }

        // Settings which can be inherited from section's parent.
        store.get(
          store.keys
        , { forum_id: section.parent, user_id: user._id }
        , { skipCache: true }
        , function (err, settings) {

          if (err) {
            callback(err);
            return;
          }

          // No such moderator at parent section.
          if (!settings) {
            env.response.data.is_inherited = false;
            env.response.data.parent_settings = null;
            callback();
            return;
          }

          env.response.data.is_inherited = true;
          env.response.data.parent_settings = {};

          _.forEach(settings, function (setting, key) {
            env.response.data.parent_settings[key] = setting.value;
          });
          callback();
        });
      });
    });
  });
};
