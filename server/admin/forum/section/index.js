// Show page with full editable tree of forum sections.
//
'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});


  N.wire.before(apiPath, function* sections_fetch(env) {
    env.data.sections = yield N.models.forum.Section
                                  .find()
                                  .sort('display_order')
                                  .lean(true);
  });


  N.wire.before(apiPath, function* moderators_fetch(env) {
    let SectionModeratorStore = N.settings.getStore('section_moderator');

    if (!SectionModeratorStore) {
      throw {
        code:    N.io.APP_ERROR,
        message: 'Settings store `section_moderator` is not registered.'
      };
    }

    // Register section's moderators for `users_join` hooks.
    env.data.users = env.data.users || [];

    yield env.data.sections.map(section => {
      section.own_moderator_list = [];

      return SectionModeratorStore.getModeratorsInfo(section._id).then(moderators => {
        moderators.forEach(moderator => {
          // Select moderator entries with non-inherited settings.
          if (moderator.own > 0) {
            section.own_moderator_list.push(moderator._id);
            env.data.users.push(moderator._id);
          }
        });
      });
    });
  });


  N.wire.on(apiPath, function section_index(env) {
    function buildSectionsTree(parent) {
      let selectedSections = env.data.sections.filter(
        // Universal way for equal check on: Null, ObjectId, and String.
        section => String(section.parent || null) === String(parent));

      selectedSections.forEach(section => {
        // Recursively collect descendants.
        section.children = buildSectionsTree(section._id);
      });

      return selectedSections;
    }

    env.res.sections = buildSectionsTree(null);
  });

  N.wire.after(apiPath, function title_set(env) {
    env.res.head.title = env.t('title');
  });
};
