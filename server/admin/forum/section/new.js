// Show create form for new section.


'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});

  N.wire.on(apiPath, function section_new(env, callback) {
    N.models.forum.Section
        .find()
        .setOptions({ lean: true })
        .exec(function (err, allowedParents) {

      if (err) {
        callback(err);
        return;
      }

      env.res.allowed_parents = allowedParents;
      callback();
    });
  });

  N.wire.after(apiPath, function title_set(env) {
    env.res.head.title = env.t('title');
  });
};
