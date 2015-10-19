// Get posts list with all data needed to render
//
// in:
//
// - env.data.topic_hid
// - env.data.build_posts_ids (env, callback) -
//       should fill either `env.data.posts_ids` or `env.data.posts_hids`
//
// out:
//
//   env:
//     res:
//       settings: ...
//       topic: ...         # sanitized, with restricted fields
//       posts: ...         # array, sanitized, with restricted fields
//       section: ...       # { hid: ... }
//       own_bookmarks: ... # array of posts ids bookmarked by user
//       own_votes: ...     # hash of votes owned by user ({ <post_id>: <value> })
//     data:
//       posts_visible_statuses: ...
//       settings: ...
//       topic: ...
//       posts: ...
//       section: ...
//       own_bookmarks: ...
//       own_votes: ...
//

'use strict';

var _ = require('lodash');

var fields = require('./_fields/post_list.js');

module.exports = function (N, apiPath) {

  // Shortcuts
  var Section = N.models.forum.Section;
  var Topic   = N.models.forum.Topic;
  var Post    = N.models.forum.Post;


  // Fetch topic
  //
  N.wire.before(apiPath, function fetch_topic(env, callback) {
    Topic.findOne({ hid: env.data.topic_hid })
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
    Section.findOne({ _id: env.data.topic.section })
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


  // Fetch permissions
  //
  N.wire.before(apiPath, function fetch_permissions(env, callback) {
    env.extras.settings.params.section_id = env.data.section._id;

    env.extras.settings.fetch(fields.settings, function (err, result) {
      if (err) {
        callback(err);
        return;
      }

      env.data.settings = result;
      callback();
    });
  });


  // Check access permissions
  //
  N.wire.before(apiPath, function check_access(env, callback) {
    var access_env = { params: { topics: env.data.topic.hid, user_info: env.user_info } };

    N.wire.emit('internal:forum.access.topic', access_env, function (err) {
      if (err) {
        callback(err);
        return;
      }

      if (!access_env.data.access_read) {
        callback(N.io.NOT_FOUND);
        return;
      }

      callback();
    });
  });


  // Define visible post statuses
  //
  N.wire.before(apiPath, function define_visible_post_st(env) {
    var postVisibleSt = [ Post.statuses.VISIBLE ];

    if (env.data.settings.can_see_hellbanned || env.user_info.hb) {
      postVisibleSt.push(Post.statuses.HB);
    }

    if (env.data.settings.forum_mod_can_delete_topics) {
      postVisibleSt.push(Post.statuses.DELETED);
    }

    if (env.data.settings.forum_mod_can_see_hard_deleted_topics) {
      postVisibleSt.push(Post.statuses.DELETED_HARD);
    }

    env.data.posts_visible_statuses = postVisibleSt;
  });


  // Get posts ids
  //
  N.wire.before(apiPath, function get_posts_ids(env, callback) {
    env.data.build_posts_ids(env, callback);
  });


  // Fetch posts
  //
  N.wire.on(apiPath, function fetch_posts(env, callback) {
    var by_hid = !!env.data.posts_hids;

    Post.find()
        .where(by_hid ? 'hid' : '_id').in(env.data[by_hid ? 'posts_hids' : 'posts_ids'])
        .where('st').in(env.data.posts_visible_statuses)
        .where('topic').equals(env.data.topic._id)
        .lean(true)
        .exec(function (err, posts) {

      if (err) {
        callback(err);
        return;
      }

      // 1. Fill `env.data.posts_ids` if doesn't yet exist (if selecting by hids)
      // 2. Push results to `env.data.posts` in `env.data.posts_ids` order
      //
      var postsById = posts.reduce(function (acc, p) {
        acc[by_hid ? p.hid : p._id] = p;
        return acc;
      }, {});

      env.data.posts = [];

      if (by_hid) {
        env.data.posts_ids = [];
      }

      env.data[by_hid ? 'posts_hids' : 'posts_ids'].forEach(function (id) {
        var post = postsById[id];

        if (post) {
          env.data.posts.push(post);
        }

        if (by_hid) {
          env.data.posts_ids.push(post._id);
        }
      });

      callback();
    });
  });


  // Fetch bookmarks
  //
  N.wire.after(apiPath, function fetch_bookmarks(env, callback) {
    N.models.forum.PostBookmark.find()
        .where('user_id').equals(env.user_info.user_id)
        .where('post_id').in(env.data.posts_ids)
        .lean(true)
        .exec(function (err, bookmarks) {

      if (err) {
        callback(err);
        return;
      }

      env.data.own_bookmarks = bookmarks;
      callback();
    });
  });


  // Fetch votes
  //
  N.wire.after(apiPath, function fetch_votes(env, callback) {
    N.models.users.Vote.find()
        .where('from').equals(env.user_info.user_id)
        .where('for').in(env.data.posts_ids)
        .where('value').in([ 1, -1 ])
        .lean(true)
        .exec(function (err, votes) {

      if (err) {
        callback(err);
        return;
      }

      env.data.own_votes = votes;
      callback();
    });
  });


  // Collect users
  //
  N.wire.after(apiPath, function collect_users(env) {
    env.data.users = env.data.users || [];

    if (env.data.topic.del_by) {
      env.data.users.push(env.data.topic.del_by);
    }

    env.data.posts.forEach(function (post) {
      if (post.user) {
        env.data.users.push(post.user);
      }
      if (post.to_user) {
        env.data.users.push(post.to_user);
      }
      if (post.del_by) {
        env.data.users.push(post.del_by);
      }
      if (post.import_users) {
        env.data.users = env.data.users.concat(post.import_users);
      }
    });
  });


  // Sanitize post statuses
  //
  N.wire.after(apiPath, function post_statuses_sanitize(env) {
    env.data.posts_out = [];

    env.data.posts.forEach(function (post) {
      var restrictedPost = _.pick(post, fields.post);

      // Sanitize statuses
      if (restrictedPost.st === Post.statuses.HB && !env.data.settings.can_see_hellbanned) {
        restrictedPost.st = restrictedPost.ste;
        delete restrictedPost.ste;
      }

      env.data.posts_out.push(restrictedPost);
    });
  });


  // Sanitize post votes
  //
  N.wire.after(apiPath, function post_votes_sanitize(env) {
    env.data.posts_out.forEach(function (post) {

      // Show `votes_hb` counter only for hellbanned users
      if (env.user_info.hb) {
        post.votes = post.votes_hb;
      }

      delete post.votes_hb;
    });
  });


  // Sanitize and fill topic
  //
  N.wire.after(apiPath, function topic_sanitize(env) {
    var topic = _.pick(env.data.topic, fields.topic);

    // Sanitize topic
    if (topic.st === Topic.statuses.HB && !env.data.settings.can_see_hellbanned) {
      topic.st = topic.ste;
      delete topic.ste;
    }

    if (topic.cache_hb && (env.user_info.hb || env.data.settings.can_see_hellbanned)) {
      topic.cache = topic.cache_hb;
    }

    delete topic.cache_hb;

    env.res.topic = topic;
  });


  // Fill response except topic
  //
  N.wire.after(apiPath, function fill_response(env) {

    // Fill posts
    env.res.posts = env.data.posts_out;

    // Fill section
    env.res.section = _.pick(env.data.section, fields.section);

    // Fill settings
    env.res.settings = env.data.settings;

    // Fill bookmarks
    env.res.own_bookmarks = _.pluck(env.data.own_bookmarks, 'post_id');

    // Fill votes
    env.res.own_votes = _.mapValues(_.indexBy(env.data.own_votes || [], 'for'), function (vote) {
      return vote.value;
    });
  });
};
