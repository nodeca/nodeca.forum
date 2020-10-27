// Tree of visible forum sections
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid: { type: 'integer', required: true }
  });


  // Check if user has an access to this section
  //
  N.wire.before(apiPath, async function check_access(env) {
    let section = await N.models.forum.Section.findOne({ hid: env.params.section_hid }).lean(true);

    if (!section) throw N.io.NOT_FOUND;

    let access_env = { params: { sections: section, user_info: env.user_info } };

    await N.wire.emit('internal:forum.access.section', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Fill sections tree by subcall
  //
  N.wire.on(apiPath, async function fill_sections_tree(env) {
    await N.wire.emit('internal:forum.sections_tree', env);
  });
};
