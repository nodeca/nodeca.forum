// Show forums list
//
"use strict";


////////////////////////////////////////////////////////////////////////////////

module.exports = function (N, apiPath) {
  N.validate(apiPath, {
  });


  // Request handler
  //
  N.wire.on(apiPath, function (env, callback) {
    env.response.data.head.title = env.helpers.t('admin.forum.index.title');

    N.models.forum.Section.find().sort('display_order').exec(function (err, sections) {
      if (err) {
        callback(err);
        return;
      }
      env.data.sections = sections;
      callback();
    });
  });
};
