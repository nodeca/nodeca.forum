// Update forum moderator settings.


'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    section_id: { format: 'mongo', required: true },
    user_id:    { format: 'mongo', required: true },
    settings: {
      type: 'object',
      required: true,
      patternProperties: {
        '.*': {
          anyOf: [
            { type: 'null' },
            {
              type: 'object',
              additionalProperties: false,
              properties: { value: { required: true } }
            }
          ]
        }
      }
    }
  });

  N.wire.on(apiPath, function* moderator_update(env) {
    let SectionModeratorStore = N.settings.getStore('section_moderator');

    if (!SectionModeratorStore) {
      throw {
        code:    N.io.APP_ERROR,
        message: 'Settings store `section_moderator` is not registered.'
      };
    }

    // Fetch forum section just to ensure it exists.
    let section = yield N.models.forum.Section
                            .findById(env.params.section_id)
                            .lean(true);
    if (!section) {
      throw N.io.NOT_FOUND;
    }

      // Fetch usergroup just to ensure it exists.
    let user = yield N.models.users.User
                          .findById(env.params.user_id)
                          .lean(true);
    if (!user) {
      throw N.io.NOT_FOUND;
    }

    yield SectionModeratorStore.set(
      env.params.settings,
      { section_id: section._id, user_id: user._id }
    );
  });
};
