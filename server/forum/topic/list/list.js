// Fetch pure posts data. Used:
// - from topic page, as sub-request
// - from ajax, to "append next page"
//
"use strict";


var _  = require('lodash');

// collections fields filters
var fields = require('./_fields.js');

// topic and post statuses
var statuses = require('../_statuses.js');


////////////////////////////////////////////////////////////////////////////////

module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    // topic id
    hid: {
      type: "integer",
      minimum: 1,
      required: true
    },
    section_hid: {
      type: "integer",
      minimum: 1
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
  var Post = N.models.forum.Post;


  // fetch topic info & check that topic exists
  //
  N.wire.before(apiPath, function fetch_topic_info(env, callback) {

    env.extras.puncher.start('Topic info prefetch');

    Topic.findOne({ hid: env.params.hid }).setOptions({ lean: true })
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

      env.data.topic = topic;
      callback();
    });
  });


  // fetch section info
  //
  N.wire.before(apiPath, function fetch_section_info(env, callback) {

    env.extras.puncher.start('Forum info prefetch');

    Section.findOne({ _id: env.data.topic.section }).setOptions({ lean: true })
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

      env.data.section = section;
      callback();
    });
  });


  // check access permissions
  //
  N.wire.before(apiPath, function check_permissions(env, callback) {

    env.extras.settings.params.section_id = env.data.topic.section;
    env.extras.puncher.start('Fetch settings');

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


  // `params.section_hid` can be wrong (old link to moved topic)
  // If params.section_hid defined, and not correct - redirect to proper location
  //
  N.wire.before(apiPath, function fix_section_hid(env) {
    if (!env.params.hasOwnProperty('section_hid')) {
      return;
    }

    if (env.data.section.hid !== +env.params.section_hid) {
      return {
        code: N.io.REDIRECT,
        head: {
          'Location': N.runtime.router.linkTo('forum.topic', {
            hid:       env.data.topic.hid,
            section_hid: env.data.section.hid,
            page:     env.params.page || 1
          })
        }
      };
    }
  });


  // fetch posts per page setting
  //
  N.wire.before(apiPath, function check_and_set_page_info(env, callback) {
    env.extras.puncher.start('Fetch posts per page setting');

    env.extras.settings.fetch(['posts_per_page'], function (err, settings) {
      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      env.data.posts_per_page = settings.posts_per_page;
      callback();
    });
  });


  // Fill page data or redirect to last page, if requested > available
  //
  N.wire.before(apiPath, function check_and_set_page_info(env) {
    var per_page = env.data.posts_per_page,
        max      = Math.ceil(env.data.topic.cache.real.post_count / per_page) || 1,
        current  = parseInt(env.params.page, 10);

    if (current > max) {
      // Requested page is BIGGER than maximum - redirect to the last one
      return {
        code: N.io.REDIRECT,
        head: {
          "Location": N.runtime.router.linkTo('forum.topic', {
            section_id: env.data.topic.section_id,
            hid:        env.params.hid,
            page:       max
          })
        }
      };
    }

    // requested page is OK. propose data for pagination
    env.res.page = { max: max, current: current };
  });

  // fetch and prepare posts
  //
  // ##### params
  //
  // - `id`         topic id
  // - `page`       page number
  //
  N.wire.on(apiPath, function (env, callback) {
    var start;
    var query;

    var posts_per_page = env.data.posts_per_page;

    env.extras.puncher.start('Post ids prefetch');


    // FIXME add state condition to select only visible posts

    start = (env.params.page - 1) * posts_per_page;

    // Unlike topics list, we can use simplified fetch,
    // because posts are always ordered by id - no need to sort by timestamp
    Post
      .find({ topic: env.data.topic._id })
      .select('_id')
      .sort('ts')
      .skip(start)
      .limit(posts_per_page + 1)
      .setOptions({ lean: true })
      .exec(function (err, docs) {

      env.extras.puncher.stop(!!docs ? { count: docs.length } : null);

      if (err) {
        callback(err);
        return;
      }

      // No page -> return empty data, without trying to fetch posts
      if (!docs.length) {
        // Very rarely, user can request next page, when moderator deleted topic tail.
        env.data.posts = [];
        callback();
        return;
      }

      env.extras.puncher.start('Get posts by _id list');

      // FIXME modify state condition (deleted and etc) if user has permission
      // If no hidden posts - no conditions needed, just select by IDs

      query = Post.find({ topic: env.data.topic._id }).where('_id').gte(_.first(docs)._id);
      if (docs.length <= posts_per_page) {
        query.lte(_.last(docs)._id);
      }
      else {
        query.lt(_.last(docs)._id);
      }

      query.select(fields.post_in.join(' ')).setOptions({ lean: true })
          .exec(function (err, posts) {

        env.extras.puncher.stop(!!posts ? { count: posts.length } : null);
        env.extras.puncher.stop();

        if (err) {
          callback(err);
          return;
        }

        env.data.posts = posts;
        callback();
      });
    });

  });

  // Build response:
  //  - posts list -> posts
  //  - collect users ids
  //
  N.wire.after(apiPath, function build_posts_list_and_users(env, callback) {
    var posts;

    env.extras.puncher.start('Post-process posts/users');

    posts = env.res.posts = env.data.posts;

    env.data.users = env.data.users || [];

    // collect users
    posts.forEach(function (post) {
      if (post.user) {
        env.data.users.push(post.user);
      }
    });

    env.extras.puncher.stop();

    callback();
  });


  // Add topic info
  //
  N.wire.after(apiPath, function fill_topic_info(env) {
    env.res.topic = _.extend({}, env.res.topic,
      _.pick(env.data.topic, [
        '_id',
        'hid',
        'title',
        'st',
        'ste'
      ])
    );
  });

  // Add section info
  //
  N.wire.after(apiPath, function fill_topic_info(env) {
    env.res.section = _.extend({}, env.res.section,
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

    env.extras.puncher.start("Fetch 'can_see_hellbanned' for statuses sanitizer");

    env.extras.settings.fetch(['can_see_hellbanned'], function (err, settings) {
      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      if (settings.can_see_hellbanned) {
        callback();
        return;
      }

      //sanitize topic statuses
      var topic = env.res.topic;
      if (topic.st === statuses.topic.HB) {
        topic.st = topic.ste;
        delete topic.ste;
      }

      //sanitize post statuses
      var posts = env.res.posts;
      posts.forEach(function (post) {
        if (post.st === statuses.topic.HB) {
          post.st = post.ste;
          delete post.ste;
        }
      });

      callback();
    });
  });

  // Add permissions, required to render posts list
  //
  N.wire.after(apiPath, function expose_settings(env, callback) {

    env.extras.settings.params.section_id = env.data.topic.section;
    env.extras.puncher.start('Fetch public posts list settings');

    env.extras.settings.fetch(['forum_can_reply'], function (err, settings) {
      env.extras.puncher.stop();

      if (err) {
        callback(err);
        return;
      }

      env.res.settings = _.extend({}, env.res.settings, settings);
      callback();
    });
  });

};
