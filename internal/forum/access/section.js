// Check section permissions
//
// In:
//
// - params.sections - array of id or models.forum.Section. Could be plain value
// - params.user_info - user id or Object with `usergroups` array
// - params.preload - array of posts, topics or sections (used as a cache)
// - data - cache + result
//   - access_read
//   - sections
// - cache - object of `id => post, topic or section`, only used internally
//
// Out:
//
// - data.access_read - array of boolean. If `params.sections` is not array - will be plain boolean
//

'use strict';


const ObjectId = require('mongoose').Types.ObjectId;
const userInfo = require('nodeca.users/lib/user_info');


module.exports = function (N, apiPath) {

  //////////////////////////////////////////////////////////////////////////
  // Hook for the "get permissions by url" feature, used in snippets
  //
  N.wire.on('internal:common.access', async function check_section_access(access_env) {
    let match = N.router.matchAll(access_env.params.url).reduce(function (acc, match) {
      return match.meta.methods.get === 'forum.section' ? match : acc;
    }, null);

    if (!match) return;

    let result = await N.models.forum.Section.findOne()
                           .where('hid').equals(match.params.section_hid)
                           .select('_id is_enabled')
                           .lean(true);

    if (!result) return;

    let access_env_sub = { params: { sections: result, user_info: access_env.params.user_info } };

    await N.wire.emit('internal:forum.access.section', access_env_sub);

    access_env.data.access_read = access_env_sub.data.access_read;
  });


  /////////////////////////////////////////////////////////////////////////////
  // Initialize return value for data.access_read
  //
  N.wire.before(apiPath, { priority: -100 }, function init_access_read(locals) {
    locals.data = locals.data || {};

    let sections = Array.isArray(locals.params.sections) ?
                   locals.params.sections :
                   [ locals.params.sections ];

    locals.data.section_ids = sections.map(function (section) {
      return ObjectId.isValid(section) ? section : section._id;
    });

    locals.data.access_read = locals.data.section_ids.map(() => null);

    // fill in cache
    locals.cache = locals.cache || {};

    sections.forEach(section => {
      if (!ObjectId.isValid(section)) locals.cache[section._id] = section;
    });

    (locals.params.preload || []).forEach(object => { locals.cache[object._id] = object; });
  });


  // Fetch user user_info if it's not present already
  //
  N.wire.before(apiPath, async function fetch_usergroups(locals) {
    if (ObjectId.isValid(String(locals.params.user_info))) {
      locals.data.user_info = await userInfo(N, locals.params.user_info);
      return;
    }

    // Use presented
    locals.data.user_info = locals.params.user_info;
  });


  // Fetch sections if it's not present already
  //
  N.wire.before(apiPath, async function fetch_sections(locals) {
    let ids = locals.data.section_ids
                  .filter((__, i) => locals.data.access_read[i] !== false)
                  .filter(id => !locals.cache[id]);

    if (!ids.length) return;

    let result = await N.models.forum.Section
                           .find()
                           .where('_id').in(ids)
                           .select('_id is_enabled')
                           .lean(true);

    result.forEach(section => {
      locals.cache[section._id] = section;
    });

    // mark all sections that weren't found as "no access"
    locals.data.section_ids.forEach((id, i) => {
      if (!locals.cache[id]) locals.data.access_read[i] = false;
    });
  });


  // Check section permissions
  //
  N.wire.on(apiPath, async function check_section_access(locals) {

    function check(section, i) {
      if (locals.data.access_read[i] === false) return Promise.resolve();

      if (!section || !section.is_enabled) {
        locals.data.access_read[i] = false;
        return Promise.resolve();
      }

      let params = {
        usergroup_ids: locals.data.user_info.usergroups,
        section_id: section._id
      };

      return N.settings.get('forum_can_view', params, {})
        .then(forum_can_view => {
          // Section permission
          if (!forum_can_view) {
            locals.data.access_read[i] = false;
          }
        });
    }

    await Promise.all(locals.data.section_ids.map((id, i) => check(locals.cache[id], i)));
  });


  // If no function reported error at this point, allow access
  //
  N.wire.after(apiPath, { priority: 100 }, function allow_read(locals) {
    locals.data.access_read = locals.data.access_read.map(val => val !== false);

    // If `params.sections` is not array - `data.access_read` should be also not an array
    if (!Array.isArray(locals.params.sections)) {
      locals.data.access_read = locals.data.access_read[0];
    }
  });
};
