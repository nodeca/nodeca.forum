// Fill subsections data in response for forum.index & forum.section
//
'use strict';


const _                = require('lodash');
const async            = require('async');
const memoizee         = require('memoizee');
const sanitize_section = require('nodeca.forum/lib/sanitizers/section');
const thenify          = require('thenify');


////////////////////////////////////////////////////////////////////////////////


module.exports = function (N, apiPath) {

  /*
   * filterVisibility(s_ids, g_ids, callback)
   * - s_ids (array) - subsections ids to filter by access permissions
   * - g_ids (array) - current user groups ids
   *
   * Returns  hash { _id: Boolean(visibility) } for selected subsections
   */
  let filterVisibility = thenify(memoizee(
    function (s_ids, g_ids, callback) {
      let result = {};

      async.each(s_ids, (_id, next) => {
        let params = { section_id: _id, usergroup_ids: g_ids };

        N.settings.get([ 'forum_can_view' ], params).then(data => {
          result[_id] = data.forum_can_view;
          process.nextTick(next);
        }, err => process.nextTick(() => next(err)));
      }, err => callback(err, result));
    },
    {
      async:      true,
      maxAge:     60000, // cache TTL = 60 seconds
      primitive:  true   // keys are calculated as toStrings, ok for our case
    }
  ));

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
  N.wire.before(apiPath, function* fetch_subsections_tree_info(env) {

    // - get all sections for index (to be able check excluded by user)
    // - get 2 levels [0,1] for section
    let subsections = yield N.models.forum.Section.getChildren(env.data.section ? env.data.section._id : null,
                                                               env.data.section ? 2 : -1);

    // Don't show disabled section
    subsections = subsections.filter(s => s.is_enabled);

    // sections order is always fixed, no needs to sort.
    let s_ids = subsections.map(s => s._id.toString());

    // groups should be sorted, to avoid cache duplication
    let g_ids = env.user_info.usergroups.sort();

    let visibility = yield filterVisibility(s_ids, g_ids);

    env.data.subsections_info = _.filter(subsections, s => visibility[s._id]);
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
  N.wire.on(apiPath, function* subsections_fetch_visible(env) {
    let _ids = env.data.subsections_info.map(s => s._id);
    env.data.subsections = [];

    let sections = yield N.models.forum.Section.find()
                            .where('_id').in(_ids)
                            .lean(true);

    // sort result in the same order as ids
    _.forEach(env.data.subsections_info, subsectionInfo => {
      let foundSection = _.find(sections, s => s._id.equals(subsectionInfo._id));

      if (!foundSection) return; // continue

      foundSection.level = subsectionInfo.level;
      env.data.subsections.push(foundSection);
    });
  });


  // Sanitize subsections
  //
  N.wire.after(apiPath, function* subsections_sanitize(env) {
    env.data.subsections = yield sanitize_section(N, env.data.subsections, env.user_info);
  });


  // Fill response data
  //
  N.wire.after(apiPath, function subsections_fill_response(env) {

    env.data.users = env.data.users || [];

    // Collect users from subsections. Only first & second levels required
    // Calculate deepness limit, depending on `forum index` or `forum.section`
    let max_subsection_level = Number((env.data.section || {}).level) + 2;

    env.data.subsections.forEach(function (doc) {
      // queue users only for first 2 levels (those are not displayed on level 3)
      if (doc.level < max_subsection_level) {
        if (doc.cache.last_user) {
          env.data.users.push(doc.cache.last_user);
        }
      }
    });

    // build response tree
    let root = (env.data.section || {})._id || null;
    env.res.subsections = to_tree(env.data.subsections, root);
  });
};
