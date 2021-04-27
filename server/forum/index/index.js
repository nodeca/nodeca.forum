// Main forum page (forums list)
//
'use strict';


////////////////////////////////////////////////////////////////////////////////

module.exports = function (N, apiPath) {

  N.validate(apiPath, {});


  // Fill list of sections excluded by user
  //
  N.wire.before(apiPath, async function fill_excluded_list(env) {
    if (!env.user_info.is_member) {
      env.res.excluded_sections = env.data.excluded_sections = [];
      return;
    }

    let result = await N.models.forum.ExcludedSections.findOne()
                          .where('user').equals(env.user_info.user_id)
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
  N.wire.after(apiPath, async function forum_index(env) {
    let project = await N.settings.get('general_project_name');

    env.res.head.title = env.t('title', { project });
    env.res.head.canonical = N.router.linkTo('forum.index', env.params);
  });
};
