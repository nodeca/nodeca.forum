// Main forum page (forums list)
//
'use strict';


////////////////////////////////////////////////////////////////////////////////

module.exports = function (N, apiPath) {

  N.validate(apiPath, {});


  // Fill list of sections excluded by user
  //
  N.wire.before(apiPath, function* fill_excluded_list(env) {
    if (env.user_info.is_guest) {
      env.res.excluded_sections = env.data.excluded_sections = [];
      return;
    }

    let result = yield N.models.forum.ExcludedSections.findOne()
                          .where('user_id').equals(env.user_info.user_id)
                          .lean(true);

    env.res.excluded_sections = env.data.excluded_sections = (result || {}).excluded_sections || [];
  });


  // Fill sections via subcall
  //
  N.wire.on(apiPath, function subsections_fill_subcall(env) {
    return N.wire.emit('internal:forum.subsections_fill', env);
  });


  // Fill breadcrumbs info
  //
  N.wire.after(apiPath, function fill_topic_breadcrumbs(env) {
    return N.wire.emit('internal:forum.breadcrumbs_fill', { env });
  });


  // Fill head meta
  //
  N.wire.after(apiPath, function set_forum_index_breadcrumbs(env) {
    env.res.head.title = env.t('title');
    env.res.head.canonical = N.router.linkTo('forum.index', env.params);
  });
};
