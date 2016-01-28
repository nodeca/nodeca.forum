// Per-forum usergroup setting store.
//
// Structure of the store:
//
//     SectionUsergroupStore:
//       _id: ...
//       section_id: ...
//       data:
//         usergroup1_id:
//           setting1_key:
//             value: Mixed
//             own: Boolean
//
'use strict';


const _        = require('lodash');
const memoizee = require('memoizee');
const thenify  = require('thenify');
const co       = require('co');


module.exports = function (N) {

  // Helper to fetch usergroups by IDs
  //
  function fetchSectionSettings(id, callback) {
    N.models.forum.SectionUsergroupStore
      .findOne({ section_id: id })
      .lean(true)
      .exec(callback);
  }

  // Memoized version of `fetchSectionSettings` helper.
  // Revalidate cache after 30 seconds.
  //
  let fetchSectionSettingsCached = thenify(memoizee(fetchSectionSettings, {
    async:     true,
    maxAge:    30000,
    primitive: true
  }));

  let fetchSectionSettingsAsync = thenify(fetchSectionSettings);


  let SectionUsergroupStore = N.settings.createStore({
    //
    // params:
    //   section_id      - ObjectId
    //   usergroup_ids - Array of ObjectIds
    //
    // options:
    //   skipCache  - Boolean
    //   extended   - Boolean; Add `own` (aka non-inherited) property to result.
    //
    // This store *always* set `force` flag to true.
    //
    // If section has no direct settings for a usergroup, empty setting
    // values will be returned instead. Such values have the lowest priority,
    // so other stores can take advance.
    //
    get: co.wrap(function* (keys, params, options) {
      if (!params.section_id) {
        throw '`section_id` parameter is required for getting settings from `section_usergroup` store.';
      }

      if (!_.isArray(params.usergroup_ids) || _.isEmpty(params.usergroup_ids)) {
        throw '`usergroup_ids` parameter required to be non-empty array for getting ' +
              'settings from `section_usergroup` store.';
      }

      let fetch = options.skipCache ? fetchSectionSettingsAsync : fetchSectionSettingsCached;
      let section_settings = yield fetch(params.section_id);
      let results = {};

      if (!section_settings) {
        throw `'section_usergroup' store for forum section ${params.section_id} does not exist.`;
      }

      keys.forEach(settingName => {
        let settings = [];

        // Collect settings for given usergroups. Use empty values non-provided
        // settings to fallback to another store if possible.
        params.usergroup_ids.forEach(usergroupId => {
          if (!section_settings.data ||
            !section_settings.data[usergroupId] ||
            !section_settings.data[usergroupId][settingName]) {

            // Use empty value instead.
            settings.push({
              value: this.getEmptyValue(settingName),
              force: false
            });
            return;
          }

          let setting = section_settings.data[usergroupId][settingName];

          // For extended mode - get copy of whole setting object.
          // For normal mode - get copy of only value field.
          setting = options.extended ? _.clone(setting) : _.pick(setting, 'value');

          // This store always implies `force` option, but we don't keep it
          // in the database.
          setting.force = true;

          settings.push(setting);
        });

        // Get merged value.
        results[settingName] = N.settings.mergeValues(settings);
      });

      return results;
    }),

    //
    // params:
    //   section_id     - ObjectId
    //   usergroup_id - ObjectId
    //
    set: co.wrap(function* (settings, params) {
      var self = this;

      if (!params.section_id) {
        throw '`section_id` parameter is required for saving settings into `section_usergroup` store.';
      }

      if (!params.usergroup_id) {
        throw '`usergroup_id` parameter required for saving settings into `section_usergroup` store.';
      }

      let section_settings = yield N.models.forum.SectionUsergroupStore.findOne({ section_id: params.section_id });

      if (!section_settings) {
        throw `'section_usergroup' store for forum section ${params.section_id} does not exist.`;
      }

      let usergroup_settings = section_settings.data[params.usergroup_id] || {};

      Object.keys(settings).forEach(key => {
        let setting = settings[key];

        if (setting !== null) {
          // NOTE: It's no need to put `force` flag into the database, since
          // this store always implies `force` at `Store#get`.
          usergroup_settings[key] = {
            value: setting.value,
            own:   true
          };
        } else {
          delete usergroup_settings[key];
        }
      });

      section_settings.data[params.usergroup_id] = usergroup_settings;
      section_settings.markModified('data');

      yield section_settings.save();
      yield self.updateInherited(params.section_id);
    })
  });

  // Update inherited setting on all sections.
  //
  // `sectionId` is optional. If omitted - update all sections.
  //
  SectionUsergroupStore.updateInherited = co.wrap(function* updateInherited(sectionId) {
    let self = this;
    let allSections = yield N.models.forum.Section.find({}).select('_id parent').lean(true);
    let allSettings = yield N.models.forum.SectionUsergroupStore.find({});


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


    // Find first own setting by name for usergroup.
    //
    function findInheritedSetting(sectionId, usergroupId, settingName) {
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
        N.logger.warn(`'section_usergroup' store for forum section ${sectionId} does not exist.`);
        return null;
      }

      let usergroup_settings = section_settings.data[usergroupId] || {};

      // Setting exists, and it is not inherited from another section.
      if (usergroup_settings[settingName] &&
        usergroup_settings[settingName].own) {
        return usergroup_settings[settingName];
      }

      // Recursively walk through ancestors sequence.
      if (sect.parent) {
        return findInheritedSetting(sect.parent, usergroupId, settingName);
      }

      return null;
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

    // Fetch list of all existent usergroup ids.
    let usergroups = yield N.models.users.UserGroup.find({}, '_id', { lean: true });


    function updateOne(section) {
      let section_settings = getSettingsBySectionId(section._id);

      if (!section_settings) {
        N.logger.warn(`'section_usergroup' store for forum section ${section._id} does not exist.`);
        return Promise.resolve();
      }

      usergroups.forEach(usergroup => {
        let usergroup_settings = section_settings.data[usergroup._id] || {};

        self.keys.forEach(settingName => {
          // Do not touch own settings. We only update inherited settings.
          if (usergroup_settings[settingName] &&
            usergroup_settings[settingName].own) {
            return;
          }

          let setting = findInheritedSetting(section.parent, usergroup._id, settingName);

          if (setting) {
            // Set/update inherited setting.
            usergroup_settings[settingName] = {
              value: setting.value,
              own:   false
            };
          } else {
            // Drop deprected inherited setting.
            delete usergroup_settings[settingName];
          }
        });

        section_settings.data[usergroup._id] = usergroup_settings;
        section_settings.markModified('data');
      });

      return section_settings.save();
    }


    yield sectionsToUpdate.map(updateOne);
  });


  // Remove all overriden usergroup settings at specific section.
  //
  /*eslint-disable max-len*/
  SectionUsergroupStore.removePermissions = co.wrap(function* removePermissions(sectionId, usergroupId) {
    let section_settings = yield N.models.forum.SectionUsergroupStore.findOne({ section_id: sectionId });

    if (!section_settings) return;

    delete section_settings.data[usergroupId];
    section_settings.markModified('data');

    yield section_settings.save();
    yield this.updateInherited(sectionId);
  });


  // Remove all setting entries for specific usergroup.
  //
  SectionUsergroupStore.removeUsergroup = co.wrap(function* removeUsergroup(usergroupId) {
    let sections = yield N.models.forum.SectionUsergroupStore.find({});

    sections.map(section_settings => {
      let usergroup_settings = section_settings.data[usergroupId];

      if (!usergroup_settings) return Promise.resolve();

      delete section_settings.data[usergroupId];
      section_settings.markModified('data');

      return section_settings.save();
    });
  });


  return SectionUsergroupStore;
};
