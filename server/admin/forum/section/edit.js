// Show edit form for a section.
//
'use strict';


const _  = require('lodash');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    _id: { format: 'mongo', required: true }
  });


  // Fetch current section
  //
  N.wire.before(apiPath, function* section_edit_fetch_current(env) {
    let currentSection = yield N.models.forum.Section.findById(env.params._id).lean(true);

    if (!currentSection) throw N.io.NOT_FOUND;

    env.res.current_section = currentSection;
  });


  // Fetch sections tree & remove current leaf to avoid circular dependency
  //
  N.wire.on(apiPath, function* fetch_data(env) {
    let allSections = yield N.models.forum.Section.getChildren();

    // exclude current section
    env.data.allowed_parents = _.filter(allSections, section => !section._id.equals(env.params._id));
  });


  N.wire.after(apiPath, function* fill_parents_path(env) {
    let _ids = env.data.allowed_parents.map(s => s._id);

    let sections = yield N.models.forum.Section.find()
      .where('_id').in(_ids)
      .select('_id title')
      .lean(true);

    env.res.allowed_parents = [];

    // sort result in the same order as ids
    env.data.allowed_parents.forEach(allowedParent => {
      let foundSection = _.find(sections, section => section._id.equals(allowedParent._id));

      foundSection.level = allowedParent.level;
      env.res.allowed_parents.push(foundSection);
    });
  });


  N.wire.after(apiPath, function title_set(env) {
    env.res.head.title = env.t('title', {
      name: env.res.current_section.title
    });
  });
};
