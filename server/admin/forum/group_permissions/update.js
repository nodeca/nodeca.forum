// Update usergroup permissions for a forum section.


'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    section_id:   { format: 'mongo', required: true },
    usergroup_id: { format: 'mongo', required: true },
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

  N.wire.on(apiPath, async function group_permissions_update(env) {
    let SectionUsergroupStore = N.settings.getStore('section_usergroup');

    if (!SectionUsergroupStore) {
      throw {
        code:    N.io.APP_ERROR,
        message: 'Settings store `section_usergroup` is not registered.'
      };
    }

    // Fetch forum section just to ensure it exists.
    let section = await N.models.forum.Section.findById(env.params.section_id)
                                              .lean(true);
    if (!section) {
      throw N.io.NOT_FOUND;
    }

    // Fetch usergroup just to ensure it exists.
    let usergroup = await N.models.users.UserGroup.findById(env.params.usergroup_id)
                                                  .lean(true);
    if (!usergroup) {
      throw N.io.NOT_FOUND;
    }

    await SectionUsergroupStore.set(
      env.params.settings,
      { section_id: section._id, usergroup_id: usergroup._id }
    );
  });
};
