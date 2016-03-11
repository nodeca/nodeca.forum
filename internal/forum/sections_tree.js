// Tree of visible forum sections (used in topic move dialogs).
//
// - env.res.sections - out
//
'use strict';


module.exports = function (N, apiPath) {

  // Fetch sections
  //
  N.wire.before(apiPath, function* sections_fetch(env) {
    env.data.sections = yield N.models.forum.Section
                                  .find()
                                  .sort('display_order')
                                  .select('_id hid title parent is_category is_enabled is_excludable')
                                  .lean(true);
  });


  // Filter sections by access
  //
  N.wire.before(apiPath, function* filter_access(env) {
    let access_env = { params: { sections: env.data.sections, user_info: env.user_info } };

    yield N.wire.emit('internal:forum.access.section', access_env);

    env.data.sections = env.data.sections.reduce((acc, section, i) => {
      if (access_env.data.access_read[i]) {
        acc.push(section);
      }

      return acc;
    }, []);
  });


  // Build sections tree
  //
  N.wire.on(apiPath, function build_tree(env) {
    function buildSectionsTree(parent) {
      let selectedSections = env.data.sections.filter(
        // Universal way for equal check on: Null, ObjectId, and String.
        section => String(section.parent || null) === String(parent)
      );

      selectedSections.forEach(section => {
        // Recursively collect descendants.
        section.children = buildSectionsTree(section._id);
      });

      return selectedSections;
    }

    env.res.sections = buildSectionsTree(null);
  });
};
