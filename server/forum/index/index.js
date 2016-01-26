// Main forum page (forums list)
//
'use strict';


////////////////////////////////////////////////////////////////////////////////

module.exports = function (N, apiPath) {
  N.validate(apiPath, {
  });


  // Request handler
  //
  N.wire.on(apiPath, function forum_index(env, callback) {
    N.wire.emit('internal:forum.subsections_fill', env, callback);
  });

  // Fill breadcrumbs info
  //
  N.wire.after(apiPath, function fill_topic_breadcrumbs(env, callback) {
    N.wire.emit('internal:forum.breadcrumbs_fill', { env }, callback);
  });

  // Fill head meta
  //
  N.wire.after(apiPath, function set_forum_index_breadcrumbs(env) {
    env.res.head.title = env.t('title');
    env.res.head.canonical = N.router.linkTo('forum.index', env.params);
  });
};
