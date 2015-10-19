// Check topic permissions
//
// In:
//
// - params.topics - array of hids, ids or models.forum.Topic. Could be plain value
// - params.user_info - user id or Object with `usergroups` array
// - data - cache + result
//   - user_info
//   - access_read
//   - topics
//
// Out:
//
// - data.access_read - data.access_read - array of boolean. If `params.topics` is not array - will be plain boolean
//
'use strict';


var _        = require('lodash');
var ObjectId = require('mongoose').Types.ObjectId;
var async    = require('async');
var userInfo = require('nodeca.users/lib/user_info');


module.exports = function (N, apiPath) {

  // Initialize return value for data.access_read
  //
  N.wire.before(apiPath, { priority: -100 }, function init_access_read(locals) {
    locals.data = locals.data || {};

    locals.data.topics = _.isArray(locals.params.topics) ? locals.params.topics : [ locals.params.topics ];

    locals.data.access_read = locals.data.topics.map(function () {
      return null;
    });
  });


  // Check that all `data.topics` have same type
  //
  N.wire.before(apiPath, function check_params_type(locals) {
    var items = locals.data.topics;
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
        return new Error('internal:forum.access.topic - can\'t mix object types in request');
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


  // Fetch topics if it's not present already
  //
  N.wire.before(apiPath, function fetch_topics(locals, callback) {
    if (locals.data.type === 'Number') {
      var hids = locals.data.topics.filter(function (__, i) {
        return locals.data.access_read[i] !== false;
      });

      N.models.forum.Topic.find()
          .where('hid').in(hids).select('hid st ste section').lean(true).exec(function (err, result) {

        if (err) {
          callback(err);
          return;
        }

        locals.data.topics.forEach(function (hid, i) {
          if (locals.data.access_read[i] === false) {
            return; // continue
          }

          locals.data.topics[i] = _.find(result, { hid: hid });

          if (!locals.data.topics[i]) {
            locals.data.access_read[i] = false;
          }
        });
        callback();
      });
      return;
    }

    if (locals.data.type === 'ObjectId') {
      var ids = locals.data.topics.filter(function (__, i) {
        return locals.data.access_read[i] !== false;
      });

      N.models.forum.Topic.find()
          .where('_id').in(ids).select('_id st ste section').lean(true).exec(function (err, result) {

        if (err) {
          callback(err);
          return;
        }

        locals.data.topics.forEach(function (id, i) {
          if (locals.data.access_read[i] === false) {
            return; // continue
          }

          locals.data.topics[i] = _.find(result, { _id: String(id) });

          if (!locals.data.topics[i]) {
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


  // Check topic and section permissions
  //
  N.wire.on(apiPath, function check_topic_access(locals, callback) {
    var Topic = N.models.forum.Topic;
    var setting_names = [
      'can_see_hellbanned',
      'forum_can_view',
      'forum_mod_can_delete_topics',
      'forum_mod_can_see_hard_deleted_topics'
    ];

    async.forEachOf(locals.data.topics, function (topic, i, next) {
      if (locals.data.access_read[i] === false) {
        next();
        return;
      }

      var params = {
        user_id: locals.data.user_info.user_id,
        usergroup_ids: locals.data.user_info.usergroups,
        section_id: topic.section
      };

      N.settings.get(setting_names, params, {}, function (err, settings) {
        if (err) {
          next(err);
          return;
        }

        // Section permission
        if (!settings.forum_can_view) {
          locals.data.access_read[i] = false;
          next();
          return;
        }

        // Topic permissions
        var topicVisibleSt = Topic.statuses.LIST_VISIBLE.slice(0);

        if (locals.data.user_info.hb || settings.can_see_hellbanned) {
          topicVisibleSt.push(Topic.statuses.HB);
        }

        if (settings.forum_mod_can_delete_topics) {
          topicVisibleSt.push(Topic.statuses.DELETED);
        }

        if (settings.forum_mod_can_see_hard_deleted_topics) {
          topicVisibleSt.push(Topic.statuses.DELETED_HARD);
        }

        if (topicVisibleSt.indexOf(topic.st) === -1) {
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

    // If `params.topics` is not array - `data.access_read` should be also not an array
    if (!_.isArray(locals.params.topics)) {
      locals.data.access_read = locals.data.access_read[0];
    }
  });
};
