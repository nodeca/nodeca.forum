// Show page with full editable tree of forum sections.


'use strict';


var _     = require('lodash');
var async = require('async');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});


  N.wire.before(apiPath, function sections_fetch(env, callback) {
    N.models.forum.Section
        .find()
        .sort('display_order')
        .lean(true)
        .exec(function (err, sections) {

      env.data.sections = sections;
      callback(err);
    });
  });


  N.wire.before(apiPath, function moderators_fetch(env, callback) {
    var SectionModeratorStore = N.settings.getStore('section_moderator');

    if (!SectionModeratorStore) {
      callback({
        code:    N.io.APP_ERROR
      , message: 'Settings store `section_moderator` is not registered.'
      });
      return;
    }

    // Register section's moderators for `users_join` hooks.
    env.data.users = env.data.users || [];

    async.each(env.data.sections, function (section, next) {
      section.own_moderator_list = [];

      SectionModeratorStore.getModeratorsInfo(section._id, function (err, moderators) {
        if (err) {
          next(err);
          return;
        }

        _.forEach(moderators, function (moderator) {
          // Select moderator entries with non-inherited settings.
          if (moderator.own > 0) {
            section.own_moderator_list.push(moderator._id);
            env.data.users.push(moderator._id);
          }
        });
        next();
      });
    }, callback);
  });


  N.wire.on(apiPath, function section_index(env) {
    function buildSectionsTree(parent) {
      var selectedSections = _.filter(env.data.sections, function (section) {
        // Universal way for equal check on: Null, ObjectId, and String.
        return String(section.parent || null) === String(parent);
      });

      _.forEach(selectedSections, function (section) {
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
