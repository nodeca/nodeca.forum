// Tree of visible forum sections
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {});


  // Check user auth
  //
  N.wire.before(apiPath, function check_access(env) {
    if (!env.user_info.is_member) throw N.io.NOT_FOUND;
  });


  // Fill list of sections excluded by user
  //
  N.wire.on(apiPath, async function fill_excluded_list(env) {
    let result = await N.models.forum.ExcludedSections.findOne()
                          .where('user').equals(env.user_info.user_id)
                          .lean(true);

    env.res.selected = result?.excluded_sections || [];
  });


  // Fill sections tree by subcall
  //
  N.wire.after(apiPath, async function fill_sections_tree(env) {
    await N.wire.emit('internal:forum.sections_tree', env);
  });
};
