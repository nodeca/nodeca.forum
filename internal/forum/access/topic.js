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


const _        = require('lodash');
const ObjectId = require('mongoose').Types.ObjectId;
const userInfo = require('nodeca.users/lib/user_info');


module.exports = function (N, apiPath) {

  // Initialize return value for data.access_read
  //
  N.wire.before(apiPath, { priority: -100 }, function init_access_read(locals) {
    locals.data = locals.data || {};

    locals.data.topics = _.isArray(locals.params.topics) ? locals.params.topics.slice() : [ locals.params.topics ];

    locals.data.access_read = locals.data.topics.map(function () {
      return null;
    });
  });


  // Check that all `data.topics` have same type
  //
  N.wire.before(apiPath, function check_params_type(locals) {
    let items = locals.data.topics;
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
        return new Error('internal:forum.access.topic - can\'t mix object types in request');
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


  // Fetch topics if it's not present already
  //
  N.wire.before(apiPath, function* fetch_topics(locals) {
    if (locals.data.type === 'Number') {
      let hids = locals.data.topics.filter((__, i) => locals.data.access_read[i] !== false);

      let result = yield N.models.forum.Topic
                            .find()
                            .where('hid').in(hids)
                            .select('hid st ste section')
                            .lean(true);

      locals.data.topics.forEach((hid, i) => {
        if (locals.data.access_read[i] === false) return; // continue

        locals.data.topics[i] = _.find(result, { hid });

        if (!locals.data.topics[i]) {
          locals.data.access_read[i] = false;
        }
      });
      return;
    }

    if (locals.data.type === 'ObjectId') {
      let ids = locals.data.topics.filter((__, i) => locals.data.access_read[i] !== false);

      let result = yield N.models.forum.Topic
                            .find()
                            .where('_id').in(ids)
                            .select('_id st ste section')
                            .lean(true);

      locals.data.topics.forEach(function (id, i) {
        if (locals.data.access_read[i] === false) return; // continue

        locals.data.topics[i] = _.find(result, r => String(r._id) === String(id));

        if (!locals.data.topics[i]) {
          locals.data.access_read[i] = false;
        }
      });
      return;
    }
  });


  // Check sections permission
  //
  N.wire.before(apiPath, function* check_sections(locals) {
    let sections = _.uniq(_.map(locals.data.topics, t => String(t.section)));
    let access_env = { params: { sections, user_info: locals.data.user_info } };
    yield N.wire.emit('internal:forum.access.section', access_env);

    // section_id -> access
    let sections_access = {};

    sections.forEach((section_id, i) => {
      sections_access[section_id] = access_env.data.access_read[i];
    });

    locals.data.topics.forEach((topic, i) => {
      if (!sections_access[topic.section]) locals.data.access_read[i] = false;
    });
  });


  // Check topic and section permissions
  //
  N.wire.on(apiPath, function* check_topic_access(locals) {
    let Topic = N.models.forum.Topic;
    let setting_names = [
      'can_see_hellbanned',
      'forum_can_view',
      'forum_mod_can_delete_topics',
      'forum_mod_can_see_hard_deleted_topics'
    ];

    function check(topic, i) {
      if (locals.data.access_read[i] === false) {
        return Promise.resolve();
      }

      let params = {
        user_id: locals.data.user_info.user_id,
        usergroup_ids: locals.data.user_info.usergroups,
        section_id: topic.section
      };

      return N.settings.get(setting_names, params, {})
        .then(settings => {

          // Section permission
          if (!settings.forum_can_view) {
            locals.data.access_read[i] = false;
            return;
          }

          // Topic permissions
          let topicVisibleSt = Topic.statuses.LIST_VISIBLE.slice(0);

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
        });
    }

    yield _.map(locals.data.topics, (topic, i) => check(topic, i));
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
