// Show edit form for a section.


'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    _id: { type: 'string', required: true }
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

      env.response.data.current_section = currentSection;

      N.models.forum.Section
          .find()
          .ne('_id', env.params._id)
          .setOptions({ lean: true })
          .exec(function (err, allowedParents) {

        if (err) {
          callback(err);
          return;
        }

        env.response.data.allowed_parents = allowedParents;
        callback();
      });
    });
  });

  N.wire.after(apiPath, function title_set(env) {
    env.response.data.head.title = env.t('title', {
      name: env.response.data.current_section.title
    });
  });
};
