// Remove all permission overrides of usergroup at specific section.


'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    section_id:   { format: 'mongo', required: true },
    usergroup_id: { format: 'mongo', required: true }
  });

  N.wire.on(apiPath, async function group_permissions_destroy(env) {
    let SectionUsergroupStore = N.settings.getStore('section_usergroup');

    if (!SectionUsergroupStore) {
      throw {
        code:    N.io.APP_ERROR,
        message: 'Settings store `section_usergroup` is not registered.'
      };
    }

    await SectionUsergroupStore.removePermissions(env.params.section_id, env.params.usergroup_id);
  });
};
