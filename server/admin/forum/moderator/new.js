'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    section_id: { type: 'string', required: true }
  });

  N.wire.on(apiPath, function moderator_new(env, callback) {
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
        .select('_id title parent raw_settings.forum_moderator')
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

      env.response.data.head.title = env.t('title', { section: section.title });

      // Setting schemas to build client interface.
      env.response.data.setting_schemas = N.config.setting_schemas.forum_moderator;
      callback();
    });
  });
};
