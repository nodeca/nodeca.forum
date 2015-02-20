// Fetch pure topics data. Used:
// - from section page, as sub-request
// - from ajax, to "append next page"
//
'use strict';

var _     = require('lodash');

// collections fields filters
var fields = require('./_fields/topic_list.js');

////////////////////////////////////////////////////////////////////////////////

module.exports = function (N, apiPath) {

  // shortcuts
  var Section = N.models.forum.Section;
  var Topic = N.models.forum.Topic;


  // fetch section info
  N.wire.before(apiPath, function fetch_section_info(env, callback) {

    Section.findOne({ hid: env.params.hid }).lean(true)
        .exec(function (err, section) {

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
    env.extras.settings.fetch('forum_can_view', function (err, forum_can_view) {

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
    env.extras.settings.fetch('topics_per_page', function (err, topics_per_page) {

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


  // Define visible topic statuses and sorting order
  //
  N.wire.before(apiPath, function define_visible_statuses_and_sort(env, callback) {
    env.extras.settings.fetch(
      [ 'can_see_hellbanned', 'forum_mod_can_delete_topics', 'forum_mod_can_see_hard_deleted_topics' ],
      function (err, settings) {
        if (err) {
          callback(err);
          return;
        }

        var statuses = Topic.statuses;

        // Define visible statuses
        env.data.statuses = [ statuses.OPEN, statuses.CLOSED ];
        var st = env.data.statuses;

        if (settings.forum_mod_can_delete_topics) {
          st.push(statuses.DELETED);
        }

        if (settings.forum_mod_can_see_hard_deleted_topics) {
          st.push(statuses.DELETED_HARD);
        }

        if (settings.can_see_hellbanned || env.user_info.hb) {
          st.push(statuses.HB);
        }

        // Define sorting order
        env.data.topic_sort = {};
        if (env.session && (env.user_info.hb || settings.can_see_hellbanned)) {
          env.data.topic_sort['cache_hb.last_ts'] = -1;
        } else {
          env.data.topic_sort['cache.last_ts'] = -1;
        }

        callback();
      }
    );
  });


  // fetch visible topics
  //
  N.wire.on(apiPath, function fetch_visible_topics(env, callback) {

    var topics_per_page = env.data.topics_per_page;
    env.data.start = (env.params.page - 1) * topics_per_page;

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

    // fetch pinned topics
    Topic.find()
      .where('section').equals(env.data.section._id)
      .where('st').equals(Topic.statuses.PINNED)
      .select(fields.topic_in.join(' '))
      .sort(env.data.topic_sort)
      .lean(true)
      .exec(function (err, pinned_topics) {

        if (err) {
          callback(err);
          return;
        }

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
    });

    callback();

  });


  // Fill bookmarks
  //
  N.wire.after(apiPath, function fill_bookmarks(env, callback) {
    var postIds = env.data.topics.map(function (topic) {
      return topic.cache.first_post;
    });

    N.models.forum.PostBookmark.find()
        .where('user_id').equals(env.session.user_id)
        .where('post_id').in(postIds)
        .lean(true)
        .exec(function (err, bookmarks) {

      if (err) {
        callback(err);
        return;
      }

      env.res.bookmarks = _.pluck(bookmarks, 'post_id');
      callback();
    });
  });


  // Add topics into to response & collect user ids
  //
  N.wire.after(apiPath, function fill_head_and_breadcrumbs(env, callback) {

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

    callback();
  });


  // Add settings, required to render topics list
  //
  N.wire.after(apiPath, function expose_settings(env, callback) {

    env.res.show_page_number = false;

    env.extras.settings.params.section_id = env.data.section._id;
    env.extras.settings.fetch([
      'forum_can_start_topics',
      'posts_per_page' // needed for micropagination
    ], function (err, settings) {

      if (err) {
        callback(err);
        return;
      }

      env.res.settings = env.res.settings || {};
      env.res.settings = _.assign(env.res.settings, settings);

      callback();
    });
  });

};
