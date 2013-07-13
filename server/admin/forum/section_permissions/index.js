// Show tree of forum sections with usergroup permissions info.


'use strict';


var _     = require('lodash');
var async = require('async');


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

    async.series([
      //
      // Fill-in `env.response.data.usergroups` plain list.
      //
      function build_usergroups_list(next) {
        N.models.users.UserGroup
            .find()
            .select('_id short_name')
            .sort('_id')
            .setOptions({ lean: true })
            .exec(function (err, usergroups) {

          if (err) {
            next(err);
            return;
          }

          env.response.data.usergroups = _.map(usergroups, function (usergroup) {
            var i18n = '@admin.users.usergroup_names.' + usergroup.short_name;

            return {
              _id:  usergroup._id
            , name: env.t.exists(i18n) ? env.t(i18n) : usergroup.short_name
            };
          });
          next();
        });
      }
      //
      // Fill-in `env.response.data.sections` nested tree.
      //
    , function build_sections_tree(next) {
        N.models.forum.Section
            .find()
            .select('_id title parent raw_settings.forum_usergroup')
            .sort('display_order')
            .setOptions({ lean: true })
            .exec(function (err, allSections) {

          if (err) {
            next(err);
            return;
          }

          function buildSectionsTree(rootSectionId) {
            var selectedSections = _.select(allSections, function (section) {
              // Universal way for equal check on: Null, ObjectId, and String.
              return String(section.parent || null) === String(rootSectionId);
            });

            return _.map(selectedSections, function (section) {
              var overriden = {}; // Count of overriden permission settings.
              
              _.forEach(env.response.data.usergroups, function (usergroup) {
                if (section.raw_settings &&
                    section.raw_settings.forum_usergroup &&
                    section.raw_settings.forum_usergroup[usergroup._id]) {

                  overriden[usergroup._id] = _.keys(section.raw_settings.forum_usergroup[usergroup._id]).length;
                } else {
                  overriden[usergroup._id] = 0;
                }
              });

              return {
                _id:       section._id
              , title:     section.title
              , overriden: overriden
              , children:  buildSectionsTree(section._id)
              };
            });
          }

          env.response.data.sections = buildSectionsTree(null);
          next();
        });
      }
    ], callback);
  });
};
