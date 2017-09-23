// Show list of forum moderator with associated forum sections info.


'use strict';


const _     = require('lodash');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});


  N.wire.before(apiPath, function section_moderator_store_check() {
    if (!N.settings.getStore('section_moderator')) {
      throw {
        code:    N.io.APP_ERROR,
        message: 'Settings store `section_moderator` is not registered.'
      };
    }
  });


  N.wire.before(apiPath, async function sections_fetch(env) {
    let sections = await N.models.forum.Section
                            .find()
                            .lean(true);

    env.data.sections     = sections;
    env.data.sectionsById = sections
                              .reduce((acc, section) => {
                                acc[section._id] = section;
                                return acc;
                              }, {});
  });


  // Fetch moderators map `user_id` => `array of section info`.
  //
  N.wire.on(apiPath, async function moderator_index(env) {
    let SectionModeratorStore = N.settings.getStore('section_moderator'),
        sectionsByModerator = {};

    for (let i = 0; i < env.data.sections.length; i++) {
      let section = env.data.sections[i];

      let moderators = await SectionModeratorStore.getModeratorsInfo(section._id);

      for (let j = 0; j < moderators.length; j++) {
        let moderator = moderators[j];

        if (!_.has(sectionsByModerator, moderator._id)) {
          sectionsByModerator[moderator._id] = [];
        }

        sectionsByModerator[moderator._id].push({
          _id:       section._id,
          own:       moderator.own,
          inherited: moderator.inherited
        });
      }
    }

    env.res.settings_count = SectionModeratorStore.keys.length;
    env.res.sections       = env.data.sectionsById;

    env.res.moderators = _(sectionsByModerator)
      .map((sections, userId) => ({
        _id:      userId,
        sections: _.sortBy(sections, s => env.data.sectionsById[s._id].title)
      }))
      .sortBy(moderator => String(moderator._id)) // Sort moderators by user id.
      .value();
  });


  // Collect user ids for `users_join` hook. (provides users info)
  //
  N.wire.after(apiPath, function users_prepare(env) {
    env.data.users = (env.data.users || []).concat(_.map(env.res.moderators, '_id'));
  });


  N.wire.after(apiPath, function title_set(env) {
    env.res.head.title = env.t('title');
  });
};
