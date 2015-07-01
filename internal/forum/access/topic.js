// Check topic permissions
//
// In:
//  - env
//  - params.topic_hid
//
// Out:
//  - env.data.access_read
//  - env.data.topic
//

'use strict';


module.exports = function (N, apiPath) {

  // Initialize return value for env.data.access_read
  //
  N.wire.before(apiPath, { priority: -100 }, function init_access_read(data) {
    data.env.data.access_read = null;
  });


  // Fetch topic if it's not present already
  //
  N.wire.before(apiPath, function fetch_topic(data, callback) {
    var env = data.env;

    if (env.data.access_read === false) {
      callback();
      return;
    }

    if (env.data.topic) {
      callback();
      return;
    }

    N.models.forum.Topic.findOne({ hid: data.params.topic_hid })
        .lean(true)
        .exec(function (err, topic) {

      if (err) {
        callback(err);
        return;
      }

      if (!topic) {
        env.data.access_read = false;
        callback();
        return;
      }

      env.data.topic = topic;
      callback();
    });
  });


  // Check topic and section permissions
  //
  N.wire.before(apiPath, function check_topic_access(data, callback) {
    var env = data.env;
    var Topic = N.models.forum.Topic;

    if (env.data.access_read === false) {
      callback();
      return;
    }

    var setting_names = [
      'can_see_hellbanned',
      'forum_can_view',
      'forum_mod_can_delete_topics',
      'forum_mod_can_see_hard_deleted_topics'
    ];

    env.extras.settings.params.section_id = env.data.topic.section;

    env.extras.settings.fetch(setting_names, function (err, settings) {
      if (err) {
        callback(err);
        return;
      }

      // Section permission
      if (!settings.forum_can_view) {
        env.data.access_read = false;
        callback();
        return;
      }

      // Topic permissions
      var topicVisibleSt = Topic.statuses.LIST_VISIBLE.slice(0);

      if (env.user_info.hb || settings.can_see_hellbanned) {
        topicVisibleSt.push(Topic.statuses.HB);
      }

      if (settings.forum_mod_can_delete_topics) {
        topicVisibleSt.push(Topic.statuses.DELETED);
      }

      if (settings.forum_mod_can_see_hard_deleted_topics) {
        topicVisibleSt.push(Topic.statuses.DELETED_HARD);
      }

      if (topicVisibleSt.indexOf(env.data.topic.st) === -1) {
        env.data.access_read = false;
      }

      callback();
    });
  });


  // If no function reported error at this point, allow access
  //
  N.wire.after(apiPath, { priority: 100 }, function allow_read(data) {
    var env = data.env;

    if (env.data.access_read === false) {
      return;
    }

    data.env.data.access_read = true;
  });
};
