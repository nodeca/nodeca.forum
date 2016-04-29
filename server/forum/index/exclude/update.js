// Update excluded sections list
//
'use strict';


const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    sections_ids: { type: 'array', required: true, uniqueItems: true, items: { format: 'mongo', required: true } }
  });


  // Check user auth
  //
  N.wire.before(apiPath, function check_access(env) {
    if (env.user_info.is_guest) throw N.io.NOT_FOUND;
  });


  // Fetch sections
  //
  N.wire.before(apiPath, function* fetch_sections(env) {
    env.data.sections = yield N.models.forum.Section.find()
                                  .where('_id').in(env.params.sections_ids)
                                  .where('is_excludable').equals(true)
                                  .lean(true);
  });


  // Check if user has an access to this sections
  //
  N.wire.before(apiPath, function* check_access(env) {
    let access_env = { params: { sections: env.data.sections, user_info: env.user_info } };

    yield N.wire.emit('internal:forum.access.section', access_env);

    access_env.data.access_read.forEach(access => {
      if (!access) throw N.io.NOT_FOUND;
    });
  });


  // Save excluded sections
  //
  N.wire.on(apiPath, function* save_excluded_sections(env) {
    yield N.models.forum.ExcludedSections.update(
      { user: env.user_info.user_id },
      { excluded_sections: _.map(env.data.sections, '_id') || [] },
      { upsert: true }
    );
  });
};
