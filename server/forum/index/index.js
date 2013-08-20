// Main forum page (forums list)
//
"use strict";


////////////////////////////////////////////////////////////////////////////////

module.exports = function (N, apiPath) {
  N.validate(apiPath, {
  });


  // Request handler
  //
  N.wire.on(apiPath, function (env, callback) {
    env.extras.puncher.start('process index');

    N.wire.emit('internal:forum.subsections_fill', env, callback);
  });

  // Fill breadcrumbs info
  //
  N.wire.after(apiPath, function fill_topic_breadcrumbs(env, callback) {
    N.wire.emit('internal:forum.breadcrumbs_fill', { env: env }, callback);
  });

  // Fill head meta
  //
  N.wire.after(apiPath, function set_forum_index_breadcrumbs(env) {
    env.res.head.title = env.t('title');

    env.extras.puncher.stop(); // Close main page scope
  });
};
