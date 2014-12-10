// Fetch pure topics data. Used:
// - from section page, as sub-request
// - from ajax, to "append next page"
//
'use strict';

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
      type: 'integer',
      minimum: 1,
      required: true
    },
    page: {
      type: 'integer',
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

    Section.findOne({ hid: env.params.hid }).lean(true)
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

      // Sanitize section data
      env.extras.settings.fetch('can_see_hellbanned', function (err, can_see_hellbanned) {
        if (err) {
          callback(err);
          return;
        }

        Section.sanitize(section, {
          keep_data: env.user_info.hb || can_see_hellbanned
        });

        env.data.section = section;
        callback();
      });
    });
  });

  // check access permissions
  //
  N.wire.before(apiPath, function check_permissions(env, callback) {

    env.extras.settings.params.section_id = env.data.section._id;
    env.extras.puncher.start('fetch setting (forum_can_view)');

    env.extras.settings.fetch('forum_can_view', function (err, forum_can_view) {

      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      if (!forum_can_view) {
        callback(N.io.FORBIDDEN);
        return;
      }

      callback();
    });
  });


  // fetch posts per page setting
  //
  N.wire.before(apiPath, function check_and_set_page_info(env, callback) {

    env.extras.puncher.start('fetch setting (topics_per_page)');

    env.extras.settings.fetch('topics_per_page', function (err, topics_per_page) {

      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      env.data.topics_per_page = topics_per_page;
      callback();
    });
  });


  // Fill page data
  //
  N.wire.before(apiPath, function set_page_info(env) {
    var per_page = env.data.topics_per_page,
        max      = Math.ceil(env.data.section.cache.topic_count / per_page) || 1,
        current  = parseInt(env.params.page, 10);

    env.res.page = env.data.page = { max: max, current: current };
  });


  // define visible topic statuses and define sorting order
  //
  N.wire.before(apiPath, function define_visible_statuses_and_sort(env, callback) {

    env.extras.settings.fetch([ 'can_see_hellbanned', 'forum_mod_can_manage_pending' ], function (err, settings) {

      if (err) {
        callback(err);
        return;
      }

      // Define visible statuses
      env.data.statuses = [ statuses.topic.OPEN, statuses.topic.CLOSED ];
      var st = env.data.statuses;

      if (settings.can_see_hellbanned || env.user_info.hb) {
        st.push(statuses.topic.HB);
      }

      if (settings.forum_mod_can_manage_pending) {
        st.push(statuses.topic.PENDING);
        st.push(statuses.topic.DELETED);
      }

      // Define sorting order
      env.data.topic_sort = {};
      if (env.session && (env.user_info.hb || settings.can_see_hellbanned)) {
        env.data.topic_sort['cache_hb.last_ts'] = -1;
      } else {
        env.data.topic_sort['cache.last_ts'] = -1;
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

    // Select _id first to use covered index
    //
    // Pagination includes all visible topics (including deleted, hellbanned, e t.c.) to simplify query
    // This is acceptable for interface

    Topic.find()
      .where('section').equals(env.data.section._id)
      .where('st').in(env.data.statuses)
      .select('_id')
      .sort(env.data.topic_sort)
      .skip(env.data.start)
      .limit(topics_per_page)
      .lean(true)
      .exec(function (err, ids) {

      if (err) {
        callback(err);
        return;
      }

      Topic.find()
        .where('_id').in(ids)
        .select(fields.topic_in.join(' '))
        .sort(env.data.topic_sort)
        .lean(true)
        .exec(function (err, visible_topics) {

        if (err) {
          callback(err);
          return;
        }

        env.extras.puncher.stop({ count: visible_topics.length });

        env.data.topics =  visible_topics || [];

        callback();
      });
    });
  });


  // fetch pinned topics
  //
  N.wire.after(apiPath, function fetch_topics(env, callback) {

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
      .lean(true)
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


  // Add section info to response
  //
  N.wire.after(apiPath, function fill_topic_info(env) {
    env.res.section = _.assign({}, env.res.section, _.pick(env.data.section, [
      '_id',
      'hid',
      'title'
    ]));
  });


  // Sanitize response info. We should not show hellbanned last post info to users
  // that cannot view hellbanned content.
  //
  N.wire.after(apiPath, function sanitize_statuses(env, callback) {

    env.extras.puncher.start('sanitize data');

    env.extras.settings.fetch('can_see_hellbanned', function (err, can_see_hellbanned) {
      if (err) {
        callback(err);
        return;
      }

      env.data.topics.forEach(function (doc) {
        Topic.sanitize(doc, {
          keep_data: env.user_info.hb || can_see_hellbanned,
          keep_statuses: can_see_hellbanned
        });
      });

      env.extras.puncher.stop();
    });

    callback();

  });


  // Add topics into to response & collect user ids
  //
  N.wire.after(apiPath, function fill_head_and_breadcrumbs(env, callback) {

    env.extras.puncher.start('collect user ids');

    env.res.topics = env.data.topics;

    env.data.users = env.data.users || [];

    // collect users from topics
    env.data.topics.forEach(function (doc) {
      if (doc.cache.first_user) {
        env.data.users.push(doc.cache.first_user);
      }
      if (doc.cache.last_user) {
        env.data.users.push(doc.cache.last_user);
      }
    });

    env.extras.puncher.stop();

    callback();
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

      env.res.settings = env.res.settings || {};
      env.res.settings = _.assign(env.res.settings, settings);

      env.extras.puncher.stop(); // Close main page scope

      callback();
    });
  });

};
