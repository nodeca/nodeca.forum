// Show tree of forum sections with usergroup permissions info.


'use strict';


var _     = require('lodash');
var async = require('async');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});


  N.wire.before(apiPath, function section_usergroup_store_check() {
    if (!N.settings.getStore('section_usergroup')) {
      return {
        code:    N.io.APP_ERROR
      , message: 'Settings store `section_usergroup` is not registered.'
      };
    }
  });


  N.wire.before(apiPath, function usergroup_fetch(env, callback) {
    N.models.users.UserGroup
        .find()
        .sort('_id')
        .setOptions({ lean: true })
        .exec(function (err, usergroups) {

      env.data.usergroups = usergroups;
      callback(err);
    });
  });


  N.wire.before(apiPath, function section_fetch(env, callback) {
    N.models.forum.Section
        .find()
        .sort('display_order')
        .setOptions({ lean: true })
        .exec(function (err, sections) {

      env.data.sections = sections;
      callback(err);
    });
  });


  N.wire.on(apiPath, function group_permissions_index(env, callback) {
    var SectionUsergroupStore = N.settings.getStore('section_usergroup');

    // Set localized name for each usergroup.
    _.forEach(env.data.usergroups, function (usergroup) {
      var i18n = '@admin.users.usergroup_names.' + usergroup.short_name;
      usergroup.localized_name = env.t.exists(i18n) ? env.t(i18n) : usergroup.short_name;
    });

    // Set override type for each section/usergroup.
    async.forEach(env.data.sections, function (section, nextSection) {
      section.own_settings_count       = {};
      section.inherited_settings_count = {};

      async.forEach(env.data.usergroups, function (usergroup, nextGroup) {
        SectionUsergroupStore.get(
          SectionUsergroupStore.keys
        , { section_id: section._id, usergroup_ids: [ usergroup._id ] }
        , { skipCache: true, extended: true }
        , function (err, settings) {
          if (err) {
            nextGroup(err);
            return;
          }

          section.own_settings_count[usergroup._id]       = _.select(settings, { own: true  }).length;
          section.inherited_settings_count[usergroup._id] = _.select(settings, { own: false }).length;
          nextGroup();
        });
      }, nextSection);
    }, function (err) {
      if (err) {
        callback(err);
        return;
      }

      function buildSectionsTree(parent) {
        var selectedSections = _.select(env.data.sections, function (section) {
          // Universal way for equal check on: Null, ObjectId, and String.
          return String(section.parent || null) === String(parent);
        });

        // Collect children subtree for each section.
        _.forEach(selectedSections, function (section) {
          section.children = buildSectionsTree(section._id);
        });

        return selectedSections;
      }

      env.response.data.settings_count = SectionUsergroupStore.keys.length;
      env.response.data.usergroups     = env.data.usergroups;
      env.response.data.sections       = buildSectionsTree(null);
      callback();
    });
  });


  N.wire.after(apiPath, function title_set(env) {
    env.response.data.head.title = env.t('title');
  });
};
