// Tree of visible forum sections
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {});


  // Check user auth
  //
  N.wire.before(apiPath, function check_access(env) {
    if (env.user_info.is_guest) throw N.io.NOT_FOUND;
  });


  // Fill list of sections excluded by user
  //
  N.wire.on(apiPath, function* fill_excluded_list(env) {
    let result = yield N.models.forum.ExcludedSections.findOne()
                          .where('user_id').equals(env.user_info.user_id)
                          .lean(true);

    env.res.selected = (result || {}).excluded_sections || [];
  });


  // Fill sections tree by subcall
  //
  N.wire.after(apiPath, function* fill_sections_tree(env) {
    yield N.wire.emit('internal:forum.sections_tree', env);
  });
};
