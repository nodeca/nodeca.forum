// Mark all topics in section as read
//
'use strict';

const memoize = require('promise-memoize');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    // section hid
    hid: { type: 'integer', required: true },
    ts:  { type: 'integer', required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  /*
   * filterVisibility(s_ids, g_ids, callback)
   * - s_ids (array) - subsections ids to filter by access permissions
   * - g_ids (array) - current user groups ids
   *
   * Returns  hash { _id: Boolean(visibility) } for selected subsections
   */
  let filterVisibility = memoize(function (s_ids, g_ids) {
    let access_env = { params: { sections: s_ids, user_info: { usergroups: g_ids } } };

    return N.wire.emit('internal:forum.access.section', access_env).then(() =>
      s_ids.reduce((acc, _id, i) => {
        acc[_id] = access_env.data.access_read[i];
        return acc;
      }, {})
    );
  }, { maxAge: 60000 });


  // Fetch section and subsections
  //
  N.wire.before(apiPath, async function fetch_section(env) {
    let section = await N.models.forum.Section
                                .findOne({ hid: env.params.hid })
                                .lean(true);

    if (!section) throw N.io.NOT_FOUND;

    let subsections = await N.models.forum.Section.getChildren(section._id, Infinity);

    subsections.unshift(section);

    // sections order is always fixed, no needs to sort.
    let s_ids = subsections.map(s => s._id.toString());

    // groups should be sorted, to avoid cache duplication
    let g_ids = env.user_info.usergroups.sort();

    let visibility = await filterVisibility(s_ids, g_ids);

    if (!visibility[section._id]) throw N.io.NOT_FOUND;

    subsections = subsections.filter(s => visibility[s._id]);

    env.data.section_ids = subsections.map(s => s._id);
  });


  // Mark topics as read
  //
  N.wire.on(apiPath, async function mark_topics_read(env) {
    let cuts = await N.models.users.Marker.cuts(env.user_info.user_id, env.data.section_ids, 'forum_topic');
    let now = Date.now();

    for (let section_id of env.data.section_ids) {
      if (now > env.params.ts && env.params.ts > cuts[section_id]) {
        await N.models.users.Marker.markByCategory(env.user_info.user_id, section_id, env.params.ts);
      }
    }
  });
};
