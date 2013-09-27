// Show create form for new section.


'use strict';

var _  = require('lodash');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});

  N.wire.on(apiPath, function section_new(env, callback) {
    N.models.forum.Section.getChildren(function (err, allSections) {

      if (err) {
        callback(err);
        return;
      }

      env.data.allowed_parents = allSections;

      var _ids = env.data.allowed_parents.map(function (s) { return s._id; });
      env.res.allowed_parents = [];

      // Add title to sections
      N.models.forum.Section
        .find({ _id: { $in: _ids }})
        .select('_id title')
        .setOptions({ lean: true })
        .exec(function (err, sections) {

        if (err) {
          callback(err);
          return;
        }

        // sort result in the same order as ids
        _.forEach(env.data.allowed_parents, function(allowedParent) {
          var foundSection = _.find(sections, function(section) {
            return section._id.equals(allowedParent._id);
          });
          foundSection.level = allowedParent.level;
          env.res.allowed_parents.push(foundSection);
        });

        callback();
      });
    });
  });


  N.wire.after(apiPath, function title_set(env) {
    env.res.head.title = env.t('title');
  });
};
