// Remove single moderator entry at section.


'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    section_id: { format: 'mongo', required: true },
    user_id:    { format: 'mongo', required: true }
  });

  N.wire.on(apiPath, function* moderator_destroy(env) {
    let SectionModeratorStore = N.settings.getStore('section_moderator');

    if (!SectionModeratorStore) {
      throw {
        code:    N.io.APP_ERROR,
        message: 'Settings store `section_moderator` is not registered.'
      };
    }

    yield SectionModeratorStore.removeModerator(env.params.section_id, env.params.user_id);
  });
};
