// Tree of visible forum sections
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid: { type: 'integer', required: true }
  });


  // Check if user has an access to this section and delete topics in it
  //
  N.wire.before(apiPath, function* check_access(env) {
    let section = yield N.models.forum.Section.findOne({ hid: env.params.section_hid }).lean(true);

    if (!section) throw N.io.NOT_FOUND;


    let access_env = { params: { sections: section, user_info: env.user_info } };

    yield N.wire.emit('internal:forum.access.section', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;


    env.extras.settings.params.section_id = section._id;

    let forum_mod_can_delete_topics = yield env.extras.settings.fetch('forum_mod_can_delete_topics');

    if (!forum_mod_can_delete_topics) throw N.io.FORBIDDEN;
  });


  // Fill sections tree by subcall
  //
  N.wire.on(apiPath, function* fill_sections_tree(env) {
    yield N.wire.emit('internal:forum.sections_tree', env);
  });
};
