// Show edit form for forum moderator.


'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    section_id: { format: 'mongo', required: true },
    user_id:    { format: 'mongo', required: true }
  });


  N.wire.before(apiPath, function setting_stores_check() {
    if (!N.settings.getStore('section_moderator')) {
      throw {
        code:    N.io.APP_ERROR,
        message: 'Settings store `section_moderator` is not registered.'
      };
    }

    if (!N.settings.getStore('usergroup')) {
      throw {
        code:    N.io.APP_ERROR,
        message: 'Settings store `usergroup` is not registered.'
      };
    }
  });


  N.wire.before(apiPath, function* section_fetch(env) {
    env.data.section = yield N.models.forum.Section
                                .findById(env.params.section_id)
                                .lean(true);
    if (!env.data.section) throw N.io.NOT_FOUND;
  });


  N.wire.before(apiPath, function* user_fetch(env) {
    env.data.user = yield N.models.users.User
                              .findById(env.params.user_id)
                              .lean(true);

    if (!env.data.user) throw N.io.NOT_FOUND;
  });


  N.wire.on(apiPath, function* group_permissions_edit(env) {
    let SectionModeratorStore = N.settings.getStore('section_moderator'),
        UsergroupStore        = N.settings.getStore('usergroup');

    // Setting schemas to build client interface.
    env.res.setting_schemas = N.config.setting_schemas.section_moderator;

    // Expose moderator's full name.
    env.res.moderator_name = env.data.user.name;

    // Fetch settings with inheritance info for current edit section.
    env.res.settings = yield SectionModeratorStore.get(
      SectionModeratorStore.keys,
      { section_id: env.data.section._id, user_id: env.data.user._id },
      { skipCache: true, extended: true }
    );

    // Fetch inherited settings from section's parent.
    if (!env.data.section.parent) {
      env.res.parent_settings = null;
    } else {
      env.res.parent_settings = yield SectionModeratorStore.get(
        SectionModeratorStore.keys,
        { section_id: env.data.section.parent, user_id: env.data.user._id },
        { skipCache: true, extended: true }
      );
    }

    // Fetch inherited settings from usergroup.
    env.res.usergroup_settings = yield UsergroupStore.get(
      UsergroupStore.keys,
      { usergroup_ids: env.data.user.usergroups },
      { skipCache: true }
    );
  });


  N.wire.after(apiPath, function title_set(env) {
    env.res.head.title = env.t('title', { section: env.data.section.title });
  });
};
