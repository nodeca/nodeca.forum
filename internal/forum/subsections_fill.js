// Fill subsections data in response for forum.index & forum.section
//
'use strict';


const memoize          = require('promise-memoize');
const sanitize_section = require('nodeca.forum/lib/sanitizers/section');


////////////////////////////////////////////////////////////////////////////////


module.exports = function (N, apiPath) {

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


  /*
   *  to_tree(source[, root = null]) -> array
   *  - source (array): array of sections
   *  - root (mongodb.BSONPure.ObjectID|String): root section _id or null
   *
   *  Build sections tree (nested) from flat sorted array.
   */
  function to_tree(source, root) {
    let result = [];
    let nodes = {};

    source.forEach(node => {
      node.child_list = [];
      nodes[node._id] = node;
    });

    root = root ? root.toString() : null;

    // set children links for all nodes
    // and collect root children to result array
    source.forEach(node => {
      node.parent = node.parent ? node.parent.toString() : null;

      if (node.parent === root) {
        result.push(node);

      } else if (node.parent !== null) {
        // Parent can be missed, if invisible. Check it, prior to add childs.
        if (nodes[node.parent]) {
          nodes[node.parent].child_list.push(node);
        }
      }
    });

    return result;
  }

  //////////////////////////////////////////////////////////////////////////////


  // Get subsections tree in flat style (id, level) & filter visibility
  //
  N.wire.before(apiPath, async function fetch_subsections_tree_info(env) {

    // - get all sections for index (to be able check excluded by user)
    // - get 2 levels [0,1] for section
    let subsections = await N.models.forum.Section.getChildren(env.data.section?._id,
                                                               env.data.section ? 2 : -1);

    // sections order is always fixed, no needs to sort.
    let s_ids = subsections.map(s => s._id.toString());

    // groups should be sorted, to avoid cache duplication
    let g_ids = env.user_info.usergroups.sort();

    let visibility = await filterVisibility(s_ids, g_ids);

    env.data.subsections_info = subsections.filter(s => visibility[s._id]);
  });


  // Filter excluded by user sections
  //
  N.wire.before(apiPath, function filter_excluded(env) {
    if (!env.data.excluded_sections || !env.data.excluded_sections.length) return;

    let excluded_sections = env.data.excluded_sections.map(sid => String(sid));

    function excluded(section_info) {
      if (!section_info.is_excludable) return false;

      if (excluded_sections.indexOf(String(section_info._id)) === -1) return false;

      let children = section_info.children || [];

      for (let i = 0; i < children.length; i++) {
        if (!excluded(children[i])) return false;
      }

      return true;
    }

    env.data.subsections_info = env.data.subsections_info.filter(s => !excluded(s));
  });


  // Fetch subsections data and add `level` property
  //
  N.wire.on(apiPath, async function subsections_fetch_visible(env) {
    let _ids = env.data.subsections_info.map(s => s._id);
    env.data.subsections = [];

    let sections = await N.models.forum.Section.find()
                            .where('_id').in(_ids)
                            .lean(true);

    // sort result in the same order as ids
    for (let subsectionInfo of env.data.subsections_info) {
      let foundSection = sections.find(s => s._id.equals(subsectionInfo._id));

      if (!foundSection) continue;

      foundSection.level = subsectionInfo.level;
      env.data.subsections.push(foundSection);
    }
  });


  // Sanitize subsections
  //
  N.wire.after(apiPath, async function subsections_sanitize(env) {
    env.data.subsections = await sanitize_section(N, env.data.subsections, env.user_info);
  });


  // Fill response data
  //
  N.wire.after(apiPath, async function subsections_fill_response(env) {

    env.data.users = env.data.users || [];

    // Collect users from subsections. Only first & second levels required
    // Calculate deepness limit, depending on `forum index` or `forum.section`
    let max_subsection_level = Number(env.data.section?.level || 0) + 2;

    env.data.subsections.forEach(function (doc) {
      // queue users only for first 2 levels (those are not displayed on level 3)
      if (doc.level < max_subsection_level) {
        if (doc.cache.last_user) {
          env.data.users.push(doc.cache.last_user);
        }
      }
    });

    // build response tree
    let root = env.data.section?._id;
    env.res.subsections = to_tree(env.data.subsections, root);

    // data used to detect what sections have new or unread topics
    env.res.settings = env.res.settings || {};
    env.res.settings.highlight_all_unread = await env.extras.settings.fetch('highlight_all_unread');
    env.res.subsections_cuts = await N.models.users.Marker.cuts(
      env.user_info.user_id, env.data.subsections.map(s => s._id), 'forum_topic');
  });
};
