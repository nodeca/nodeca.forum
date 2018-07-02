// Show edit form for a group
//

'use strict';


const sanitize_section = require('nodeca.forum/lib/sanitizers/section');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    _id: { format: 'mongo', required: true }
  });


  N.wire.on(apiPath, async function group_edit(env) {
    let group = await N.models.nntp.Group.findById(env.params._id).lean(true);

    if (!group || group.type !== 'forum') throw N.io.NOT_FOUND;

    env.res.current_group = group;

    env.res.head.title = env.t('title', { name: group.name });

    let section = await N.models.forum.Section.findById(group.source).lean(true);

    env.res.section = await sanitize_section(N, section, env.user_info);
  });
};
