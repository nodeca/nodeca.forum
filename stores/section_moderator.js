// Per-section moderator setting store.
//
// Structure of the store:
//
//     SectionUsergroupStore:
//       _id: ...
//       section_id: ...
//       data:
//         user1_id:
//           setting1_key:
//             value: Mixed
//             own: Boolean
//
'use strict';


const _        = require('lodash');
const memoize  = require('promise-memoize');
const co       = require('bluebird-co').co;


module.exports = function (N) {

  // Helper to fetch moderators by IDs
  //
  function fetchSectionSettings(id) {
    return N.models.forum.SectionModeratorStore
      .findOne({ section_id: id })
      .lean(true)
      .exec();
  }

  // Memoized version of `fetchSectionSettings` helper.
  // Revalidate cache after 30 seconds.
  //
  let fetchSectionSettingsCached = memoize(fetchSectionSettings, { maxAge: 30000 });


  let SectionModeratorStore = N.settings.createStore({
    //
    // params:
    //   section_id - ObjectId
    //   user_id  - ObjectId
    //
    // options:
    //   skipCache  - Boolean
    //   extended   - Boolean; Add `own` (aka non-inherited) property to result.
    //
    // This store *always* set `force` flag to true.
    //
    // If section has no direct settings for the user, empty setting values
    // will be returned instead. Such values have the lowest priority, so
    // other stores can take advance.
    //
    get: co.wrap(function* (keys, params, options) {
      if (!params.section_id) {
        throw '`section_id` parameter is required for getting settings from `section_moderator` store.';
      }

      if (!params.user_id) {
        throw '`user_id` parameter is required for getting settings from `section_moderator` store.';
      }

      let fetch = options.skipCache ? fetchSectionSettings : fetchSectionSettingsCached;
      let section_settings = yield fetch(params.section_id);

      if (!section_settings) throw `'section_moderator' store for forum section ${params.section_id} does not exist.`;

      let results = {};

      // Collect settings for the given user_id. Use empty values
      // non-provided settings to fallback to another store if possible.
      keys.forEach(settingName => {
        if (!section_settings.data ||
          !section_settings.data[params.user_id] ||
          !section_settings.data[params.user_id][settingName]) {

          // Use empty value instead.
          results[settingName] = {
            value: this.getEmptyValue(settingName),
            force: false
          };
          return;
        }

        let setting = section_settings.data[params.user_id][settingName];

        // For extended mode - get copy of whole setting object.
        // For normal mode - get copy of only value field.
        setting = options.extended ? _.clone(setting) : _.pick(setting, 'value');

        // This store always implies `force` option, but we don't keep it
        // in the database.
        setting.force = true;

        results[settingName] = setting;
      });

      return results;
    }),

    //
    // params:
    //   section_id - ObjectId
    //   user_id  - ObjectId
    //
    set: co.wrap(function* (settings, params) {
      if (!params.section_id) {
        throw '`section_id` parameter is required for saving settings into `section_moderator` store.';
      }

      if (!params.user_id) {
        throw '`user_id` parameter required for saving settings into `section_moderator` store.';
      }

      let section_settings = yield N.models.forum.SectionModeratorStore.findOne({ section_id: params.section_id });

      if (!section_settings) {
        throw `'section_moderator' store for forum section ${params.section_id} does not exist.`;
      }

      let user_settings = section_settings[params.user_id] || {};

      Object.keys(settings).forEach(key => {
        let setting = settings[key];

        if (setting !== null) {
          // NOTE: It's no need to put `force` flag into the database, since
          // this store always implies `force` at `Store#get`.
          user_settings[key] = {
            value: setting.value,
            own:   true
          };
        } else {
          delete user_settings[key];
        }
      });

      if (_.isEmpty(user_settings)) {
        // Drop empty moderator entries.
        delete section_settings.data[params.user_id];
      } else {
        section_settings.data[params.user_id] = user_settings;
      }

      section_settings.markModified('data');

      yield section_settings.save();
      yield this.updateInherited(params.section_id);
    })
  });


  // Collect list of section moderators with statistics. (both own and inherited)
  // NOTE: This function only returns statistics information; no real settings.
  //
  // Result example:
  //   [
  //     {
  //       _id: '51f0835b0798894c2f000006',  // user id
  //       own: 1,       // count of changed settings done in this section
  //       inherited: 3  // count of changed settings inherited from parent section
  //     },
  //     { ... }
  //   ]
  //
  SectionModeratorStore.getModeratorsInfo = co.wrap(function* getModeratorsInfo(sectionId) {
    let section_settings = yield N.models.forum.SectionModeratorStore
                                    .findOne({ section_id: sectionId })
                                    .lean(true);

    if (!section_settings) {
      throw `'section_moderator' store for forum section ${sectionId} does not exist.`;
    }

    let result = [];

    if (section_settings.data) {
      Object.keys(section_settings.data).forEach(userId => {
        result.push({
          _id:       userId,
          own:       _.filter(section_settings.data[userId], { own: true  }).length,
          inherited: _.filter(section_settings.data[userId], { own: false }).length
        });
      });
    }

    // Sort moderators by ObjectId.
    return _.sortBy(result, moderator => String(moderator._id));
  });


  // Update inherited setting on all sections.
  //
  // `sectionId` is optional. If omitted - update all sections.
  //
  SectionModeratorStore.updateInherited = co.wrap(function* updateInherited(sectionId) {
    let allSections = yield N.models.forum.Section.find({}).select('_id parent moderators');
    let allSettings = yield N.models.forum.SectionModeratorStore.find({});


    // Get section from allSections array by its id
    //
    function getSectionById(id) {
      return allSections.filter(
        // Universal way for equal check on: Null, ObjectId, and String.
        section => String(section._id) === String(id)
      )[0];
    }

    // Get section settings from allSettings array by section id
    //
    function getSettingsBySectionId(id) {
      return allSettings.filter(
        // Universal way for equal check on: Null, ObjectId, and String.
        s => String(id) === String(s.section_id)
      )[0];
    }


    // Collect flat list of section's descendants.
    //
    function selectSectionDescendants(parentId) {
      let result = [];

      let children = allSections.filter(
        // Universal way for equal check on: Null, ObjectId, and String.
        section => String(section.parent || null) === String(parentId)
      );

      children.forEach(child => result.push(child));

      children.forEach(child => {
        selectSectionDescendants(child._id).forEach(grandchild => result.push(grandchild));
      });

      return result;
    }


    // Find first own setting by name for moderator.
    //
    function findInheritedSetting(sectionId, userId, settingName) {
      if (!sectionId) {
        return null;
      }

      let sect = getSectionById(sectionId);

      if (!sect) {
        N.logger.warn(`Forum sections collection contains a reference to non-existent section ${sectionId}`);
        return null;
      }

      let section_settings = getSettingsBySectionId(sectionId);

      if (!section_settings) {
        N.logger.warn(`'section_moderator' store for forum section ${sectionId} does not exist.`);
        return null;
      }

      let user_settings = section_settings.data[userId] || {};

      // Setting exists, and it is not inherited from another section.
      if (user_settings[settingName] &&
        user_settings[settingName].own) {
        return user_settings[settingName];
      }

      // Recursively walk through ancestors sequence.
      if (sect.parent) {
        return findInheritedSetting(sect.parent, userId, settingName);
      }

      return null;
    }


    // Collect flat list of unique moderator ids on given section
    // and all ancestor sections.
    //
    function collectModeratorIds(sectionId) {
      if (!sectionId) {
        return [];
      }

      let sect = getSectionById(sectionId);

      if (!sect) {
        N.logger.warn(`Forum sections collection contains a reference to non-existent section ${sectionId}`);
        return [];
      }

      let section_settings = getSettingsBySectionId(sectionId);

      if (!section_settings) {
        N.logger.warn(`'section_moderator' store for forum section ${sectionId} does not exist.`);
        return [];
      }

      if (section_settings.data) {
        return _.uniq(_.keys(section_settings.data).concat(collectModeratorIds(sect.parent)));
      }
      return collectModeratorIds(sect.parent);
    }


    // List of sections to recompute settings and save. All by default.
    let sectionsToUpdate = allSections;

    // If we want update only a subtree of sections,
    // collect different `sectionsToUpdate` list.
    if (sectionId) {
      let section = getSectionById(sectionId);

      if (!section) {
        throw `Forum sections collection contains a reference to non-existent section ${sectionId}`;
      }

      sectionsToUpdate = [ section ].concat(selectSectionDescendants(section._id));
    }

    yield sectionsToUpdate.map(section => {
      let section_settings = getSettingsBySectionId(section._id);

      if (!section_settings) {
        N.logger.warn(`'section_moderator' store for forum section ${sectionId} does not exist.`);
        return Promise.resolve();
      }

      // Collect all moderators (both own and inherited) for current section.
      let allModeratorIds = collectModeratorIds(section._id);

      // Inherit new/updated and drop deprecated settings for all moderators.
      allModeratorIds.forEach(userId => {
        let user_settings = section_settings.data[userId] || {};

        this.keys.forEach(settingName => {
          // Do not touch own settings. We only update inherited settings.
          if (user_settings[settingName] &&
            user_settings[settingName].own) {
            return;
          }

          let setting = findInheritedSetting(section.parent, userId, settingName);

          if (setting) {
            // Set/update inherited setting.
            user_settings[settingName] = {
              value: setting.value,
              own:   false
            };
          } else {
            // Drop deprecated inherited setting.
            delete user_settings[settingName];
          }
        });

        if (_.isEmpty(user_settings)) {
          // Drop empty moderator entries.
          delete section_settings.data[userId];
        } else {
          section_settings.data[userId] = user_settings;
        }

        section_settings.markModified('data');
      });

      return section_settings.save();
    });
  });


  // Remove single moderator entry at section.
  //
  SectionModeratorStore.removeModerator = co.wrap(function* removeModerator(sectionId, userId) {
    let section_settings = yield N.models.forum.SectionModeratorStore.findOne({ section_id: sectionId });

    if (!section_settings) {
      throw `Forum section ${sectionId} does not exist.`;
    }

    let user_settings = section_settings.data[userId];

    if (!user_settings) return;

    delete section_settings.data[userId];
    section_settings.markModified('data');

    yield section_settings.save();
    yield this.updateInherited(sectionId);
  });


  return SectionModeratorStore;
};
