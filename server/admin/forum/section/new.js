// Show create form for new section.
//
'use strict';


const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {});


  // fetch sections tree
  //
  N.wire.before(apiPath, function* section_new(env) {
    env.data.allowed_parents = yield N.models.forum.Section.getChildren();
  });


  // Prepare data
  //
  N.wire.on(apiPath, function* section_new(env) {

    let _ids = env.data.allowed_parents.map(function (s) { return s._id; });

    env.res.allowed_parents = [];

    // Add title to sections
    let sections = yield N.models.forum.Section
      .find({ _id: { $in: _ids } })
      .select('_id title')
      .lean(true);

    // sort result in the same order as ids
    env.data.allowed_parents.forEach(allowedParent => {
      let foundSection = _.find(sections, section => section._id.equals(allowedParent._id));

      foundSection.level = allowedParent.level;
      env.res.allowed_parents.push(foundSection);
    });
  });


  N.wire.after(apiPath, function title_set(env) {
    env.res.head.title = env.t('title');
  });
};
