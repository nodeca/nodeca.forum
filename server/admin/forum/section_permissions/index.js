// Show tree of forum sections with usergroup permissions info.


'use strict';


var _ = require('lodash');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});

  N.wire.on(apiPath, function section_permissions_index(env, callback) {
    var store = N.settings.getStore('forum_usergroup');

    if (!store) {
      callback({
        code:    N.io.APP_ERROR
      , message: 'Settings store `forum_usergroup` is not registered.'
      });
      return;
    }

    env.response.data.head.title     = env.t('title');
    env.response.data.settings_total = store.keys.length;

    // Collect usergroups info.
    N.models.users.UserGroup
        .find()
        .select('_id short_name')
        .sort('_id')
        .setOptions({ lean: true })
        .exec(function (err, usergroups) {

      if (err) {
        callback(err);
        return;
      }

      env.response.data.usergroups = _.map(usergroups, function (usergroup) {
        var i18n = '@admin.users.usergroup_names.' + usergroup.short_name;
        return {
          _id:  usergroup._id
        , name: env.t.exists(i18n) ? env.t(i18n) : usergroup.short_name
        };
      });

      // Collect sections tree.
      N.models.forum.Section
          .find()
          .select('_id title parent raw_settings.forum_usergroup')
          .sort('display_order')
          .setOptions({ lean: true })
          .exec(function (err, allSections) {

        if (err) {
          callback(err);
          return;
        }

        function collectSectionsTree(parent) {
          var selectedSections = _.select(allSections, function (section) {
            // Universal way for equal check on: Null, ObjectId, and String.
            return String(section.parent || null) === String(parent);
          });

          return _.map(selectedSections, function (section) {
            var overriden = {}; // Count of overriden permission settings.
            
            _.forEach(usergroups, function (usergroup) {
              overriden[usergroup._id] = 0;

              if (section.raw_settings &&
                  section.raw_settings.forum_usergroup &&
                  section.raw_settings.forum_usergroup[usergroup._id]) {
                _.forEach(section.raw_settings.forum_usergroup[usergroup._id], function (setting) {
                  if (setting.overriden) {
                    overriden[usergroup._id] += 1;
                  }
                });
              }
            });

            return {
              _id:       section._id
            , title:     section.title
            , parent:    section.parent
            , overriden: overriden
            , children:  collectSectionsTree(section._id)
            };
          });
        }

        env.response.data.sections = collectSectionsTree(null);
        callback();
      });
    });
  });
};
