// Show page with full editable tree of forum sections.


'use strict';


var async = require('async');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});


  function fetchSections(env, accumulator, parent, callback) {
    N.models.forum.Section
        .find({ parent: parent })
        .sort('display_order')
        .select('_id title parent moderator_list')
        .setOptions({ lean: true })
        .exec(function (err, sections) {

      if (err) {
        callback(err);
        return;
      }

      async.forEach(sections, function (section, next) {
        var entry = { fields: section, children: [] };

        accumulator.push(entry);
        env.data.users = env.data.users.concat(section.moderator_list);

        // Fill-in section's children.
        fetchSections(env, entry.children, section._id, next);
      }, callback);
    });
  }


  N.wire.on(apiPath, function (env, callback) {
    env.response.data.head.title = env.t('title');
    env.response.data.sections = [];

    env.data.users = env.data.users || [];

    // Fill-in sections list.
    fetchSections(env, env.response.data.sections, null, callback);
  });
};
