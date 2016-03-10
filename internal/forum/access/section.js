// Check section permissions
//
// In:
//
// - params.sections - array of hids, ids or models.forum.Section. Could be plain value
// - params.user_info - user id or Object with `usergroups` array
// - data - cache + result
//   - access_read
//   - sections
//
// Out:
//
// - data.access_read - array of boolean. If `params.sections` is not array - will be plain boolean
//
'use strict';


const _        = require('lodash');
const ObjectId = require('mongoose').Types.ObjectId;
const userInfo = require('nodeca.users/lib/user_info');


module.exports = function (N, apiPath) {

  //////////////////////////////////////////////////////////////////////////
  // Hook for the "get permissions by url" feature, used in snippets
  //
  N.wire.on('internal:common.access', function* check_section_access(access_env) {
    let match = N.router.matchAll(access_env.params.url).reduce(function (acc, match) {
      return match.meta.methods.get === 'forum.section' ? match : acc;
    }, null);

    if (!match) return;

    let access_env_sub = { params: { sections: match.params.section_hid, user_info: access_env.params.user_info } };

    yield N.wire.emit('internal:forum.access.section', access_env_sub);

    access_env.data.access_read = access_env_sub.data.access_read;
  });


  /////////////////////////////////////////////////////////////////////////////
  // Initialize return value for data.access_read
  //
  N.wire.before(apiPath, { priority: -100 }, function init_access_read(locals) {
    locals.data = locals.data || {};

    locals.data.sections = _.isArray(locals.params.sections) ? locals.params.sections : [ locals.params.sections ];

    locals.data.access_read = locals.data.sections.map(function () {
      return null;
    });
  });


  // Check that all `data.sections` have same type
  //
  N.wire.before(apiPath, function check_params_type(locals) {
    let items = locals.data.sections;
    let type, curType;

    for (let i = 0; i < items.length; i++) {
      if (_.isNumber(items[i])) {
        curType = 'Number';
      } else if (ObjectId.isValid(String(items[i]))) {
        curType = 'ObjectId';
      } else {
        curType = 'Object';
      }

      if (!type) {
        type = curType;
      }

      if (curType !== type) {
        return new Error('internal:forum.access.section - can\'t mix object types in request');
      }
    }

    locals.data.type = type;
  });


  // Fetch user user_info if it's not present already
  //
  N.wire.before(apiPath, function* fetch_usergroups(locals) {
    if (ObjectId.isValid(String(locals.params.user_info))) {
      locals.data.user_info = yield userInfo(N, locals.params.user_info);
      return;
    }

    // Use presented
    locals.data.user_info = locals.params.user_info;
  });



  // Fetch sections if it's not present already
  //
  N.wire.before(apiPath, function* fetch_sections(locals) {
    if (locals.data.type === 'Number') {
      let hids = locals.data.sections.filter((__, i) => locals.data.access_read[i] !== false);

      let result = yield N.models.forum.Section
                            .find()
                            .where('hid').in(hids)
                            .select('_id hid is_enabled')
                            .lean(true);

      locals.data.sections.forEach((hid, i) => {
        if (locals.data.access_read[i] === false) return; // continue

        locals.data.sections[i] = _.find(result, { hid });

        if (!locals.data.sections[i]) {
          locals.data.access_read[i] = false;
        }
      });
      return;
    }

    if (locals.data.type === 'ObjectId') {
      let ids = locals.data.sections.filter((__, i) => locals.data.access_read[i] !== false);

      let result = yield N.models.forum.Section
                            .find()
                            .where('_id').in(ids)
                            .select('_id is_enabled')
                            .lean(true);

      locals.data.sections.forEach((id, i) => {
        if (locals.data.access_read[i] === false) return; // continue

        locals.data.sections[i] = _.find(result, { _id: String(id) });

        if (!locals.data.sections[i]) {
          locals.data.access_read[i] = false;
        }
      });
      return;
    }
    return;
  });


  // Check section permissions
  //
  N.wire.on(apiPath, function* check_section_access(locals) {

    function check(section, i) {
      if (locals.data.access_read[i] === false) {
        return Promise.resolve();
      }

      if (!section.is_enabled) {
        locals.data.access_read[i] = false;
        return Promise.resolve();
      }

      let params = {
        user_id: locals.data.user_info.user_id,
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

    yield _.map(locals.data.sections, (section, i) => check(section, i));
  });


  // If no function reported error at this point, allow access
  //
  N.wire.after(apiPath, { priority: 100 }, function allow_read(locals) {
    locals.data.access_read = locals.data.access_read.map(val => val !== false);

    // If `params.sections` is not array - `data.access_read` should be also not an array
    if (!_.isArray(locals.params.sections)) {
      locals.data.access_read = locals.data.access_read[0];
    }
  });
};
