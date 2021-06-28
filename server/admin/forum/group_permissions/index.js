// Show tree of forum sections with usergroup permissions info.


'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});


  N.wire.before(apiPath, function section_usergroup_store_check() {
    if (!N.settings.getStore('section_usergroup')) {
      throw {
        code:    N.io.APP_ERROR,
        message: 'Settings store `section_usergroup` is not registered.'
      };
    }
  });


  N.wire.before(apiPath, async function usergroup_fetch(env) {
    env.data.usergroups = await N.models.users.UserGroup
                                    .find()
                                    .sort('_id')
                                    .lean(true);
  });


  N.wire.before(apiPath, async function section_fetch(env) {
    env.data.sections = await N.models.forum.Section
                                  .find()
                                  .sort('display_order')
                                  .lean(true);
  });


  N.wire.on(apiPath, async function group_permissions_index(env) {
    let SectionUsergroupStore = N.settings.getStore('section_usergroup');

    // Set localized name for each usergroup.
    env.data.usergroups.forEach(function (usergroup) {
      let i18n = '@admin.users.usergroup_names.' + usergroup.short_name;
      usergroup.localized_name = env.t.exists(i18n) ? env.t(i18n) : usergroup.short_name;
    });

    // Set override type for each section/usergroup.
    for (let i = 0; i < env.data.sections.length; i++) {
      let section = env.data.sections[i];

      section.own_settings_count       = {};
      section.inherited_settings_count = {};

      for (let j = 0; j < env.data.usergroups.length; j++) {
        let usergroup = env.data.usergroups[j];

        let settings = await SectionUsergroupStore.get(
          SectionUsergroupStore.keys,
          { section_id: section._id, usergroup_ids: [ usergroup._id ] },
          { skipCache: true, extended: true }
        );

        section.own_settings_count[usergroup._id]       = Object.values(settings).filter(s => s.own === true).length;
        section.inherited_settings_count[usergroup._id] = Object.values(settings).filter(s => s.own === false).length;
      }
    }

    function buildSectionsTree(parent) {
      let selectedSections = env.data.sections.filter(s => String(s.parent || null) === String(parent));

      // Collect children subtree for each section.
      selectedSections.forEach(s => { s.children = buildSectionsTree(s._id); });

      return selectedSections;
    }

    env.res.settings_count = SectionUsergroupStore.keys.length;
    env.res.usergroups     = env.data.usergroups;
    env.res.sections       = buildSectionsTree(null);
  });


  N.wire.after(apiPath, function title_set(env) {
    env.res.head.title = env.t('title');
  });
};
