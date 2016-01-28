// Get topic offset (i.e. an amount of visible topics in a section before this
// one), used to calculate pagination.
//
'use strict';


var _     = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    section_hid: { type: 'integer', required: true },
    topic_hid:   { type: 'integer', required: true }
  });

  // Shortcuts
  var Section = N.models.forum.Section;
  var Topic = N.models.forum.Topic;


  // Fetch topic
  //
  N.wire.before(apiPath, function fetch_topic(env, callback) {
    Topic.findOne({ hid: env.params.topic_hid })
        .lean(true)
        .exec(function (err, topic) {

      if (err) {
        callback(err);
        return;
      }

      if (!topic) {
        callback(N.io.NOT_FOUND);
        return;
      }

      env.data.topic = topic;
      callback();
    });
  });


  // Fetch section
  //
  N.wire.before(apiPath, function fetch_section(env, callback) {
    Section.findById(env.data.topic.section)
        .lean(true)
        .exec(function (err, section) {

      if (err) {
        callback(err);
        return;
      }

      if (!section) {
        callback(N.io.NOT_FOUND);
        return;
      }

      env.data.section = section;
      callback();
    });
  });


  // Check section access permission
  //
  N.wire.before(apiPath, function* check_access_permissions(env) {
    env.extras.settings.params.section_id = env.data.section._id;

    let forum_can_view = yield env.extras.settings.fetch('forum_can_view');

    if (!forum_can_view) throw N.io.FORBIDDEN;
  });


  // Define visible topic statuses
  //
  N.wire.before(apiPath, function* define_visible_statuses(env) {
    let statuses = Topic.statuses;

    env.extras.settings.params.section_id = env.data.section._id;

    let settings = yield env.extras.settings.fetch([
      'forum_mod_can_delete_topics',
      'forum_mod_can_see_hard_deleted_topics',
      'can_see_hellbanned'
    ]);

    env.data.topics_visible_statuses = statuses.LIST_VISIBLE.slice(0);

    if (settings.forum_mod_can_delete_topics) {
      env.data.topics_visible_statuses.push(statuses.DELETED);
    }

    if (settings.forum_mod_can_see_hard_deleted_topics) {
      env.data.topics_visible_statuses.push(statuses.DELETED_HARD);
    }

    if (settings.can_see_hellbanned || env.user_info.hb) {
      env.data.topics_visible_statuses.push(statuses.HB);
    }
  });


  // Fetch topic offset
  //
  N.wire.on(apiPath, function* fetch_offset(env) {
    env.extras.settings.params.section_id = env.data.section._id;

    let topics_per_page = yield env.extras.settings.fetch('topics_per_page');
    let cache_key = env.user_info.hb ? 'cache_hb' : 'cache';

    env.res.topic_offset = 0;
    env.res.topics_per_page = topics_per_page;
    env.data.topics_ids = [];

    // Move to the first page (i.e. return zero offset) if:
    //  - topic was moved to a different section
    //  - topic is pinned, so it's always in the first page
    //
    if (env.params.section_hid !== env.data.section.hid || env.data.topic.st === Topic.statuses.PINNED) {
      return;
    }

    let sort = {};

    sort[cache_key + '.last_post'] = -1;

    env.res.topic_offset = yield Topic.find()
      .where('section').equals(env.data.section._id)
      .where(cache_key + '.last_post').gt(env.data.topic[cache_key].last_post)
      .where('st').in(_.without(env.data.topics_visible_statuses, Topic.statuses.PINNED))
      .count();
  });
};
