// Fill out methods for NNTP server
//

'use strict';

const _  = require('lodash');


module.exports = function (N) {

  N.wire.before('init:server.nntp', function init_nntp_methods_forum(nntp) {

    nntp._filterAccess_forum = async function (session, groups) {
      let forum_groups = groups.filter(group => (group.type === 'forum'));

      if (!forum_groups.length) return;

      let sections = await N.models.forum.Section.find()
                               .where('_id').in(_.map(forum_groups, 'source'))
                               .lean(true);

      if (!sections.length) return;

      let user_info = await this._getUserInfo(session);

      let access_env = { params: { sections, user_info } };

      await N.wire.emit('internal:forum.access.section', access_env);

      let visible_sections_by_id = _.keyBy(
        sections.filter((section, idx) => !!access_env.data.access_read[idx]),
        '_id'
      );

      forum_groups.forEach(group => {
        if (visible_sections_by_id[group.source]) group._allow_access = true;
      });
    };
  });
};
