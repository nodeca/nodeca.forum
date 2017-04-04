// Fill out methods for NNTP server
//

'use strict';

const _       = require('lodash');
const memoize = require('promise-memoize');


module.exports = function (N) {

  N.wire.before('init:server.nntp', function init_nntp_methods_forum(nntp) {

    const get_section = memoize(function _get_section(id) {
      return N.models.forum.Section.findById(id).lean(true);
    }, { maxAge: 5 * 60 * 1000 });

    nntp._filterAccess_forum = async function (session, groups) {
      let result = groups.map(() => false);

      let forum_groups = groups.filter(group => (group.type === 'forum'));

      if (!forum_groups.length) return result;

      let sections = await Promise.all(forum_groups.map(g => get_section(g.source)));

      if (!sections.length) return result;

      let user_info = await this._getUserInfo(session);

      let access_env = { params: { sections, user_info } };

      await N.wire.emit('internal:forum.access.section', access_env);

      let visible_sections_by_id = _.keyBy(
        sections.filter((section, idx) => !!access_env.data.access_read[idx]),
        '_id'
      );

      return groups.map(group => (group.type === 'forum' && !!visible_sections_by_id[group.source]));
    };
  });
};
