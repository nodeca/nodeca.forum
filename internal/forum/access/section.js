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


var _        = require('lodash');
var ObjectId = require('mongoose').Types.ObjectId;
var async    = require('async');
var userInfo = require('nodeca.users/lib/user_info');


module.exports = function (N, apiPath) {

  //////////////////////////////////////////////////////////////////////////
  // Hook for the "get permissions by url" feature, used in snippets
  //
  N.wire.on('internal:common.access', function check_post_access(access_env, callback) {
    var match = N.router.matchAll(access_env.params.url).reduce(function (acc, match) {
      return match.meta.methods.get === 'forum.section' ? match : acc;
    }, null);

    if (!match) {
      callback();
      return;
    }

    var access_env_sub = { params: { sections: match.params.hid, user_info: access_env.params.user_info } };

    N.wire.emit('internal:forum.access.section', access_env_sub, function (err) {
      if (err) {
        callback(err);
        return;
      }

      access_env.data.access_read = access_env_sub.data.access_read;
      callback();
    });
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
    var items = locals.data.sections;
    var type, curType;

    for (var i = 0; i < items.length; i++) {
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
  N.wire.before(apiPath, function fetch_usergroups(locals, callback) {
    if (ObjectId.isValid(String(locals.params.user_info))) {
      userInfo(N, locals.params.user_info, function (err, info) {
        if (err) {
          callback(err);
          return;
        }

        locals.data.user_info = info;
        callback();
      });
      return;
    }

    // Use presented
    locals.data.user_info = locals.params.user_info;
    callback();
  });



  // Fetch sections if it's not present already
  //
  N.wire.before(apiPath, function fetch_sections(locals, callback) {
    if (locals.data.type === 'Number') {
      var hids = locals.data.sections.filter(function (__, i) {
        return locals.data.access_read[i] !== false;
      });

      N.models.forum.Section.find().where('hid').in(hids).select('_id hid').lean(true).exec(function (err, result) {
        if (err) {
          callback(err);
          return;
        }

        locals.data.sections.forEach(function (hid, i) {
          if (locals.data.access_read[i] === false) {
            return; // continue
          }

          locals.data.sections[i] = _.find(result, { hid: hid });

          if (!locals.data.sections[i]) {
            locals.data.access_read[i] = false;
          }
        });
        callback();
      });
      return;
    }

    if (locals.data.type === 'ObjectId') {
      var ids = locals.data.sections.filter(function (__, i) {
        return locals.data.access_read[i] !== false;
      });

      N.models.forum.Section.find().where('_id').in(ids).select('_id').lean(true).exec(function (err, result) {
        if (err) {
          callback(err);
          return;
        }

        locals.data.sections.forEach(function (id, i) {
          if (locals.data.access_read[i] === false) {
            return; // continue
          }

          locals.data.sections[i] = _.find(result, { _id: String(id) });

          if (!locals.data.sections[i]) {
            locals.data.access_read[i] = false;
          }
        });
        callback();
      });
      return;
    }

    callback();
    return;
  });


  // Check section permissions
  //
  N.wire.on(apiPath, function check_section_access(locals, callback) {

    async.forEachOf(locals.data.sections, function (section, i, next) {
      if (locals.data.access_read[i] === false) {
        next();
        return;
      }

      var params = {
        user_id: locals.data.user_info.user_id,
        usergroup_ids: locals.data.user_info.usergroups,
        section_id: section._id
      };

      N.settings.get('forum_can_view', params, {}, function (err, forum_can_view) {
        if (err) {
          next(err);
          return;
        }

        // Section permission
        if (!forum_can_view) {
          locals.data.access_read[i] = false;
        }

        next();
      });
    }, callback);
  });


  // If no function reported error at this point, allow access
  //
  N.wire.after(apiPath, { priority: 100 }, function allow_read(locals) {
    locals.data.access_read = locals.data.access_read.map(function (val) {
      return val !== false;
    });

    // If `params.sections` is not array - `data.access_read` should be also not an array
    if (!_.isArray(locals.params.sections)) {
      locals.data.access_read = locals.data.access_read[0];
    }
  });
};
