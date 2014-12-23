// Fetch pure posts data. Used:
// - from topic page, as sub-request
// - from ajax, to "append next page"
//
'use strict';


var _  = require('lodash');

// collections fields filters
var postFields = require('./_fields.js').post_in;
var topicFields = require('../../section/list/_fields.js').topic_in;

////////////////////////////////////////////////////////////////////////////////

module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    // topic id
    hid: {
      type: 'integer',
      minimum: 1,
      required: true
    },
    section_hid: {
      type: 'integer',
      minimum: 1
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
  var Post = N.models.forum.Post;


  // fetch topic info & check that topic exists
  //
  N.wire.before(apiPath, function fetch_topic_info(env, callback) {

    env.extras.puncher.start('topic info prefetch');

    Topic.findOne({ hid: env.params.hid }).lean(true)
        .exec(function (err, topic) {

      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      // No topic -> "Not Found" status
      if (!topic) {
        callback(N.io.NOT_FOUND);
        return;
      }

      // Sanitize topic data
      env.extras.settings.fetch('can_see_hellbanned', function (err, can_see_hellbanned) {
        if (err) {
          callback(err);
          return;
        }

        Topic.sanitize(topic, {
          keep_statuses: can_see_hellbanned,
          keep_data: env.user_info.hb || can_see_hellbanned
        });

        env.data.topic = topic;

        // Add topic info to response
        env.res.topic = _.pick(topic, topicFields);


        callback();
      });
    });
  });


  // fetch section info
  //
  N.wire.before(apiPath, function fetch_section_info(env, callback) {

    env.extras.puncher.start('section info prefetch');

    Section.findOne({ _id: env.data.topic.section }).lean(true)
        .exec(function (err, section) {

      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      // No section -> topic with missed parent, return "Not Found" too
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

    env.extras.settings.params.section_id = env.data.topic.section;
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
  N.wire.before(apiPath, function fetch_posts_per_page(env, callback) {

    env.extras.puncher.start('fetch setting (posts_per_page)');

    env.extras.settings.fetch('posts_per_page', function (err, posts_per_page) {

      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      env.data.posts_per_page = posts_per_page;
      callback();
    });
  });


  // Fill page data
  //
  N.wire.before(apiPath, function set_page_info(env) {
    var per_page = env.data.posts_per_page,
      max      = Math.ceil(env.data.topic.cache.post_count / per_page) || 1,
      current  = parseInt(env.params.page, 10);

    env.res.page = env.data.page = { max: max, current: current };
  });


  // Define post visible and paginated statuses
  //
  N.wire.before(apiPath, function get_permissions(env, callback) {
    var statuses = N.models.forum.Post.statuses;

    env.extras.settings.fetch(
      [ 'can_see_hellbanned', 'forum_mod_can_delete_topics', 'forum_mod_can_see_hard_deleted_topics' ],
      function (err, settings) {
        if (err) {
          callback(err);
          return;
        }

        env.data.statuses = {};
        var st = env.data.statuses;
        st.paginated = [ statuses.VISIBLE ];
        st.visible = [ statuses.VISIBLE ];

        if (settings.can_see_hellbanned || env.user_info.hb) {
          st.paginated.push(statuses.HB);
          st.visible.push(statuses.HB);
        }

        if (settings.forum_mod_can_delete_topics) {
          st.visible.push(statuses.DELETED);
        }

        if (settings.forum_mod_can_see_hard_deleted_topics) {
          st.visible.push(statuses.DELETED_HARD);
        }

        callback();
      }
    );
  });


  // get first and last+1 required _id for required page
  //
  N.wire.before(apiPath, function fetch_post_ids_range(env, callback) {
    var posts_per_page = env.data.posts_per_page;
    var start = (env.params.page - 1) * posts_per_page;

    env.extras.puncher.start('get posts ids');

    // Unlike topics list, we can use simplified fetch,
    // because posts are always ordered by id - no need to sort by timestamp
    Post.find()
      .where('topic').equals(env.data.topic._id)
      .where('st').in(env.data.statuses.paginated)
      .select('_id')
      .sort('_id')
      .skip(start)
      .limit(posts_per_page + 1)
      .lean(true)
      .exec(function (err, visible_posts) {

      if (err) {
        callback(err);
        return;
      }

      env.extras.puncher.stop({ count: visible_posts.length });

      // If page is not empty, get first and last post ID
      if (visible_posts.length) {
        env.data.first_post_id = _.first(visible_posts)._id;
        // Thit is the first post of the next page, it is required to include deleted posts on page tail
        env.data.last_post_id = _.last(visible_posts)._id;
      }
      callback();
    });
  });


  // fetch visible posts between first and last paginated posts
  //
  N.wire.on(apiPath, function fetch_posts(env, callback) {

    if (!env.data.first_post_id || !env.data.last_post_id) {
      env.data.posts = [];
      callback();
      return;
    }

    env.extras.puncher.start('get posts content by _id list');

    var query = Post.find()
      .where('topic').equals(env.data.topic._id)
      .where('st').in(env.data.statuses.visible)
      .where('_id').gte(env.data.first_post_id);

    // Don't cut tail on the last page
    if (env.res.page.current < env.res.page.max) {
      query.lt(env.data.last_post_id);
    }

    query.select(postFields.join(' '))
      .lean(true)
      .sort('_id')
      .exec(function (err, posts) {

      if (err) {
        callback(err);
        return;
      }

      env.extras.puncher.stop({ count: posts.length });

      env.data.posts = posts;

      callback();

    });
  });


  // Add posts into to response & collect user ids
  //
  N.wire.after(apiPath, function build_posts_list_and_users(env, callback) {

    env.extras.puncher.start('collect users ids');

    env.res.posts = env.data.posts;

    env.data.users = env.data.users || [];

    // collect users
    env.data.posts.forEach(function (post) {
      if (post.user) {
        env.data.users.push(post.user);
      }
    });

    env.data.users.push(env.data.topic.cache.first_user);

    env.extras.puncher.stop();

    callback();
  });


  // Add section info to response
  //
  N.wire.after(apiPath, function fill_topic_info(env) {
    env.res.section = _.assign({}, env.res.section,
      _.pick(env.data.section, [
        //'_id',
        'hid'
      ])
    );
  });


  // Sanitize response info. We should not show hellbanned status to users
  // that cannot view hellbanned content. In this case we use 'ste' status instead.
  //
  N.wire.after(apiPath, function sanitize_statuses(env, callback) {

    env.extras.puncher.start('fetch setting (\'can_see_hellbanned\')');

    env.extras.settings.fetch('can_see_hellbanned', function (err, can_see_hellbanned) {
      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      //sanitize post statuses
      var posts = env.res.posts;
      posts.forEach(function (post) {
        Post.sanitize(post, {
          keep_statuses: can_see_hellbanned
        });
      });

      callback();
    });
  });


  // Add permissions, required to render posts list
  //
  N.wire.after(apiPath, function expose_settings(env, callback) {

    env.extras.settings.params.section_id = env.data.topic.section;
    env.extras.puncher.start('fetch public settings for renderer');

    env.extras.settings.fetch(
      [
        'forum_can_reply',
        'forum_edit_max_time',
        'forum_can_close_topic',
        'forum_mod_can_delete_topics',
        'forum_mod_can_hard_delete_topics',
        'forum_mod_can_see_hard_deleted_topics',
        'forum_mod_can_edit_posts',
        'forum_mod_can_pin_topic',
        'forum_mod_can_edit_titles',
        'forum_mod_can_close_topic'
      ],
      function (err, result) {
        env.extras.puncher.stop();

        if (err) {
          callback(err);
          return;
        }

        env.res.settings = env.res.settings || {};
        _.assign(env.res.settings, result);

        env.extras.puncher.stop(); // Close main page scope

        callback();
      }
    );
  });

};
