// Show page with full editable tree of forum sections.


'use strict';


var async = require('async');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});


  function fetchSections(accumulator, parent, callback) {
    N.models.forum.Section
        .find({ parent: parent })
        .select('_id id title level parent parent_id parent_list parent_id_list')
        .setOptions({ lean: true })
        .exec(function (err, sections) {

      if (err) {
        callback(err);
        return;
      }

      async.forEach(sections, function (section, next) {
        var entry = { fields: section, children: [] };

        accumulator.push(entry);

        // Fill-in section's children.
        fetchSections(entry.children, section._id, next);
      }, callback);
    });
  }


  N.wire.on(apiPath, function (env, callback) {
    env.response.data.head.title = env.t('title');
    env.response.data.sections = [];

    // Fill-in sections list.
    fetchSections(env.response.data.sections, null, callback);
  });
};
