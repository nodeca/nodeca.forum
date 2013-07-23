// Show page with full editable tree of forum sections.


'use strict';


var _ = require('lodash');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});

  N.wire.on(apiPath, function section_index(env, callback) {
    N.models.forum.Section
        .find()
        .sort('display_order')
        .select('_id display_order title parent moderator_list')
        .setOptions({ lean: true })
        .exec(function (err, allSections) {

      if (err) {
        callback(err);
        return;
      }

      function buildSectionsTree(parent) {
        var selectedSections = _.select(allSections, function (section) {
          // Universal way for equal check on: Null, ObjectId, and String.
          return String(section.parent || null) === String(parent);
        });

        _.forEach(selectedSections, function (section) {
          // Recursively collect descendants.
          section.children = buildSectionsTree(section._id);
        });

        return selectedSections;
      }

      env.response.data.sections = buildSectionsTree(null);

      // Register section's moderators for `users_join` hooks.
      env.data.users = env.data.users || [];

      _.forEach(allSections, function (section) {
        env.data.users = env.data.users.concat(section.moderator_list);
      });

      callback();
    });
  });

  N.wire.after(apiPath, function title_set(env) {
    env.response.data.head.title = env.t('title');
  });
};
