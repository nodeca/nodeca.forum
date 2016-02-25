// Full tree of forum sections
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


  // Fetch sections
  //
  N.wire.before(apiPath, function* sections_fetch(env) {
    env.data.sections = yield N.models.forum.Section
                                  .find()
                                  .sort('display_order')
                                  .select('_id hid title parent is_category')
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
