// Fetch pure topics data. Used:
// - from section page, as sub-request
// - from ajax, to "append next page"
//
"use strict";

var _     = require('lodash');

// collections fields filters
var fields = require('./_fields.js');

// topic and post statuses
var statuses = require('../../_lib/statuses.js');

////////////////////////////////////////////////////////////////////////////////

module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    // section hid
    hid: {
      type: "integer",
      minimum: 1,
      required: true
    },
    page: {
      type: "integer",
      minimum: 1,
      'default': 1
    }
  });


  // shortcuts
  var Section = N.models.forum.Section;
  var Topic = N.models.forum.Topic;


  // fetch section info
  N.wire.before(apiPath, function fetch_section_info(env, callback) {

    env.extras.puncher.start('section info prefetch');

    Section.findOne({ hid: env.params.hid }).setOptions({ lean: true })
        .exec(function (err, section) {

      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      // No section ->  "Not Found"
      if (!section) {
        callback(N.io.NOT_FOUND);
        return;
      }

      env.data.section = section;
      callback();
    });
  });


  // check access permissions
  //
  N.wire.before(apiPath, function check_permissions(env, callback) {

    env.extras.settings.params.section_id = env.data.section._id;
    env.extras.puncher.start('fetch setting (forum_can_view)');

    env.extras.settings.fetch(['forum_can_view'], function (err, settings) {

      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      if (!settings.forum_can_view) {
        callback(N.io.NOT_AUTHORIZED);
        return;
      }

      callback();
    });
  });


  // fetch posts per page setting
  //
  N.wire.before(apiPath, function check_and_set_page_info(env, callback) {

    env.extras.puncher.start('fetch setting (topics_per_page)');

    env.extras.settings.fetch(['topics_per_page'], function (err, settings) {

      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      env.data.topics_per_page = settings.topics_per_page;
      callback();
    });
  });

  // Fill page data or redirect to last page, if requested > available
  //
  N.wire.before(apiPath, function check_and_set_page_info(env) {
    var per_page = env.data.topics_per_page,
        max      = Math.ceil(env.data.section.cache.real.topic_count / per_page) || 1,
        current  = parseInt(env.params.page, 10);

    if (current > max) {
      // Requested page is BIGGER than maximum - redirect to the last one
      return {
        code: N.io.REDIRECT,
        head: {
          "Location": N.runtime.router.linkTo('forum.section', {
            hid:  env.params.hid,
            page: max
          })
        }
      };
    }

    // requested page is OK. propose data for pagination
    env.res.page = { max: max, current: current };
  });


  // define topic sorting order
  //
  N.wire.before(apiPath, function add_sort(env) {
    // FIXME: that can break index
    env.data.topic_sort = {};
    if (env.session && env.user_info.hb) {
      env.data.topic_sort['cache.hb.last_ts'] = -1;
    } else {
      env.data.topic_sort['cache.real.last_ts'] = -1;
    }
  });


  // Get visible topic statuses
  //
  N.wire.before(apiPath, function get_permissions(env, callback) {

    env.extras.settings.fetch(['can_see_hellbanned', 'forum_mod_can_manage_pending'], function (err, settings) {

      if (err) {
        callback(err);
        return;
      }

      env.data.statuses = [statuses.topic.OPEN, statuses.topic.CLOSED];
      var st = env.data.statuses;

      if (settings.can_see_hellbanned || env.user_info.hb) {
        st.push(statuses.topic.HB);
      }

      if (settings.forum_mod_can_manage_pending) {
        st.push(statuses.topic.PENDING);
        st.push(statuses.topic.DELETED);
      }

      callback();
    });
  });


  // fetch visible topics
  //
  N.wire.on(apiPath, function fetch_visible_topics(env, callback) {

    var topics_per_page = env.data.topics_per_page;
    env.data.start = (env.params.page - 1) * topics_per_page;

    env.extras.puncher.start('get visible topics');

    // fetch visible topics
    Topic.find()
      .where('section').equals(env.data.section._id)
      .where('st').in(env.data.statuses)
      .select(fields.topic_in.join(' '))
      .sort(env.data.topic_sort)
      .skip(env.data.start)
      .limit(topics_per_page)
      .setOptions({ lean: true })
      .exec(function (err, visible_topics) {

        if (err) {
          callback(err);
          return;
        }

        env.extras.puncher.stop({ count: visible_topics.length });

        env.data.topics =  visible_topics;

        callback();
      });
  });

  // fetch pinned topics
  //
  N.wire.before(apiPath, function fetch_topics(env, callback) {

    // Pinned topics should be visible on the first page only
    if (env.params.page > 1) {
      callback();
      return;
    }

    env.extras.puncher.start('get pinned topics');

    // fetch pinned topics
    Topic.find()
      .where('section').equals(env.data.section._id)
      .where('st').equals(statuses.topic.PINNED)
      .select(fields.topic_in.join(' '))
      .sort(env.data.topic_sort)
      .setOptions({ lean: true })
      .exec(function (err, pinned_topics) {

        if (err) {
          callback(err);
          return;
        }

        env.extras.puncher.stop({ count: pinned_topics.length });

        env.data.topics = pinned_topics.concat(env.data.topics);

        callback();
      });
  });


  // Add topics into to response & collect user ids
  //
  N.wire.after(apiPath, function fill_head_and_breadcrumbs(env, callback) {

    env.extras.puncher.start('collect user ids');

    env.res.topics = env.data.topics;

    env.data.users = env.data.users || [];

    // collect users from topics
    env.data.topics.forEach(function (doc) {
      if (doc.cache.real.first_user) {
        env.data.users.push(doc.cache.real.first_user);
      }
      if (doc.cache.real.last_user) {
        env.data.users.push(doc.cache.real.last_user);
      }
    });

    env.extras.puncher.stop();

    callback();
  });


  // Add section info to response
  //
  N.wire.after(apiPath, function fill_topic_info(env) {
    env.res.section = _.extend({}, env.res.section, _.pick(env.data.section, [
      '_id',
      'hid',
      'title'
    ]));
  });


  // Add settings, required to render topics list
  //
  N.wire.after(apiPath, function expose_settings(env, callback) {

    env.res.show_page_number = false;

    env.extras.settings.params.section_id = env.data.section._id;
    env.extras.puncher.start('fetch public settings for renderer');

    env.extras.settings.fetch([
      'forum_can_start_topics',
      'posts_per_page' // needed for micropagination
    ], function (err, settings) {

      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      env.res.settings = _.extend({}, env.res.settings, settings);

      env.extras.puncher.stop(); // Close main page scope

      callback();
    });
  });

};