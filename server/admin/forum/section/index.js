// Show page with full editable tree of forum sections.


'use strict';


var _ = require('lodash');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});

  N.wire.on(apiPath, function section_index(env, callback) {
    env.data.users = env.data.users || []; // Used by `users_join` hook.

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

      function collectSectionsTree(parent) {
        var selectedSections = _.select(allSections, function (section) {
          // Universal way for equal check on: Null, ObjectId, and String.
          return String(section.parent || null) === String(parent);
        });

        _.forEach(selectedSections, function (section) {
          // Register section's moderators for `users_join` hooks.
          env.data.users = env.data.users.concat(section.moderator_list);

          // Recursively collect descendants.
          section.children = collectSectionsTree(section._id);
        });

        return selectedSections;
      }

      env.response.data.sections = collectSectionsTree(null);
      callback();
    });
  });

  N.wire.after(apiPath, function title_set(env) {
    env.response.data.head.title = env.t('title');
  });
};
