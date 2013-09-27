// Show edit form for a section.


'use strict';

var _  = require('lodash');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    _id: { format: 'mongo', required: true }
  });

  N.wire.on(apiPath, function section_edit(env, callback) {
    N.models.forum.Section
        .findById(env.params._id)
        .setOptions({ lean: true })
        .exec(function (err, currentSection) {

      if (err) {
        callback(err);
        return;
      }

      if (!currentSection) {
        callback(N.io.NOT_FOUND);
        return;
      }

      env.res.current_section = currentSection;

      N.models.forum.Section.getChildren(function (err, allSections) {

        if (err) {
          callback(err);
          return;
        }

        env.data.allowed_parents = _.filter(allSections, function(section) {
          // exclude current section
          return !section._id.equals(env.params._id);
        });

        // Add title to sections
        var _ids = env.data.allowed_parents.map(function (s) { return s._id; });
        env.res.allowed_parents = [];

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
  });


  N.wire.after(apiPath, function title_set(env) {
    env.res.head.title = env.t('title', {
      name: env.res.current_section.title
    });
  });
};
