// Remove all permission overrides of usergroup at specific section.


'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    section_id:   { type: 'string', required: true }
  , usergroup_id: { type: 'string', required: true }
  });

  N.wire.on(apiPath, function group_permissions_destroy(env, callback) {
    var SectionUsergroupStore = N.settings.getStore('section_usergroup');

    if (!SectionUsergroupStore) {
      callback({
        code:    N.io.APP_ERROR
      , message: 'Settings store `section_usergroup` is not registered.'
      });
      return;
    }

    SectionUsergroupStore.removePermissions(env.params.section_id, env.params.usergroup_id, callback);
  });
};
