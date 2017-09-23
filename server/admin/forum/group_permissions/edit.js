// Show edit form for per-usergroup permissions on a forum section.


'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    section_id:   { format: 'mongo', required: true },
    usergroup_id: { format: 'mongo', required: true }
  });


  N.wire.before(apiPath, function setting_stores_check() {
    if (!N.settings.getStore('section_usergroup')) {
      throw {
        code:    N.io.APP_ERROR,
        message: 'Settings store `section_usergroup` is not registered.'
      };
    }

    if (!N.settings.getStore('usergroup')) {
      throw {
        code:    N.io.APP_ERROR,
        message: 'Settings store `usergroup` is not registered.'
      };
    }
  });


  N.wire.before(apiPath, async function section_fetch(env) {
    env.data.section = await N.models.forum.Section
                                .findById(env.params.section_id)
                                .lean(true);

    if (!env.data.section) throw N.io.NOT_FOUND;
  });


  N.wire.before(apiPath, async function usergroup_fetch(env) {
    env.data.usergroup = await N.models.users.UserGroup
                                  .findById(env.params.usergroup_id)
                                  .lean(true);
    if (!env.data.usergroup) throw N.io.NOT_FOUND;
  });


  N.wire.on(apiPath, async function group_permissions_edit(env) {
    let SectionUsergroupStore = N.settings.getStore('section_usergroup'),
        UsergroupStore        = N.settings.getStore('usergroup');

    // Setting schemas to build client interface.
    env.res.setting_schemas = N.config.setting_schemas.section_usergroup;

    // Translation path for usergroup name.
    let usergroupI18n = '@admin.users.usergroup_names.' + env.data.usergroup.short_name;

    env.res.usergroup_name = env.t.exists(usergroupI18n) ? env.t(usergroupI18n) : env.data.usergroup.short_name;

    // Fetch settings with inheritance info for current edit section.
    env.res.settings = await SectionUsergroupStore.get(
      SectionUsergroupStore.keys,
      { section_id: env.data.section._id, usergroup_ids: [ env.data.usergroup._id ] },
      { skipCache: true, extended: true }
    );

    // Fetch inherited settings from section's parent.
    if (!env.data.section.parent) {
      env.res.parent_settings = null;
    } else {
      env.res.parent_settings = await SectionUsergroupStore.get(
        SectionUsergroupStore.keys,
        { section_id: env.data.section.parent, usergroup_ids: [ env.data.usergroup._id ] },
        { skipCache: true, extended: true }
      );
    }

    // Fetch inherited settings from usergroup.
    env.res.usergroup_settings = await UsergroupStore.get(
      UsergroupStore.keys,
      { usergroup_ids: [ env.data.usergroup._id ] },
      { skipCache: true }
    );
  });


  N.wire.after(apiPath, function title_set(env) {
    env.res.head.title = env.t('title', { section: env.data.section.title });
  });
};
