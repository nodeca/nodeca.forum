// Show edit form for a section.


'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    _id: { type: 'string', required: true }
  });

  N.wire.on(apiPath, function (env, callback) {
    N.models.forum.Section
        .findById(env.params._id)
      //.select('')
        .setOptions({ lean: true })
        .exec(function (err, section) {

      if (err) {
        callback(err);
        return;
      }

      env.response.data.head.title = env.t('title', { name: section.title });
    //env.response.data.section    = section;

      callback();
    });
  });
};
