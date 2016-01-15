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

var _                = require('lodash');
var sanitize_topic   = require('nodeca.forum/lib/sanitizers/topic');
var sanitize_section = require('nodeca.forum/lib/sanitizers/section');
var sanitize_post    = require('nodeca.forum/lib/sanitizers/post');

var fields = require('./_fields/post_list.js');

module.exports = function (N, apiPath) {

  // Shortcuts
  var Section = N.models.forum.Section;
  var Topic   = N.models.forum.Topic;
  var Post    = N.models.forum.Post;


  // Fetch topic
  //
  N.wire.before(apiPath, function* fetch_topic(env) {
    let topic = yield Topic.findOne({ hid: env.data.topic_hid }).lean(true);

    if (!topic) { throw N.io.NOT_FOUND; }

    env.data.topic = topic;
  });


  // Fetch section
  //
  N.wire.before(apiPath, function* fetch_section(env) {
    let section = yield Section.findOne({ _id: env.data.topic.section }).lean(true);

    if (!section) { throw N.io.NOT_FOUND; }

    env.data.section = section;
  });


  // Fetch and fill permissions
  //
  N.wire.before(apiPath, function* fetch_and_fill_permissions(env) {
    env.extras.settings.params.section_id = env.data.section._id;

    env.res.settings = env.data.settings = yield env.extras.settings.fetch(fields.settings);
  });


  // Check access permissions
  //
  N.wire.before(apiPath, function* check_access(env) {
    let access_env = { params: { topics: env.data.topic.hid, user_info: env.user_info } };

    yield N.wire.emit('internal:forum.access.topic', access_env);

    if (!access_env.data.access_read) { throw N.io.NOT_FOUND; }
  });


  // Define visible post statuses
  //
  N.wire.before(apiPath, function define_visible_post_st(env) {
    let postVisibleSt = [ Post.statuses.VISIBLE ];

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
  N.wire.before(apiPath, function* get_posts_ids(env) {
    yield env.data.build_posts_ids(env);
  });


  // Fetch posts
  //
  N.wire.on(apiPath, function* fetch_posts(env) {
    let by_hid = !!env.data.posts_hids;

    let posts = yield Post.find()
                        .where(by_hid ? 'hid' : '_id').in(env.data[by_hid ? 'posts_hids' : 'posts_ids'])
                        .where('st').in(env.data.posts_visible_statuses)
                        .where('topic').equals(env.data.topic._id)
                        .lean(true);

    // 1. Fill `env.data.posts_ids` if doesn't yet exist (if selecting by hids)
    // 2. Push results to `env.data.posts` in `env.data.posts_ids` order
    //
    var postsById = posts.reduce((acc, p) => {
      acc[by_hid ? p.hid : p._id] = p;
      return acc;
    }, {});

    env.data.posts = [];

    if (by_hid) {
      env.data.posts_ids = [];
    }

    env.data[by_hid ? 'posts_hids' : 'posts_ids'].forEach(id => {
      var post = postsById[id];

      if (post) {
        env.data.posts.push(post);
      }

      if (by_hid) {
        env.data.posts_ids.push(post._id);
      }
    });
  });


  // Fetch and fill bookmarks
  //
  N.wire.after(apiPath, function* fetch_and_fill_bookmarks(env) {
    let bookmarks = yield N.models.forum.PostBookmark.find()
                            .where('user_id').equals(env.user_info.user_id)
                            .where('post_id').in(env.data.posts_ids)
                            .lean(true);

    env.data.own_bookmarks = bookmarks;
    env.res.own_bookmarks = _.pluck(bookmarks, 'post_id');
  });


  // Fetch and fill votes
  //
  N.wire.after(apiPath, function* fetch_and_fill_votes(env) {
    let votes = yield N.models.users.Vote.find()
                          .where('from').equals(env.user_info.user_id)
                          .where('for').in(env.data.posts_ids)
                          .where('value').in([ 1, -1 ])
                          .lean(true);

    env.data.own_votes = votes;

    // [ { _id: ..., for: '562f3569c5b8d831367b0585', value: -1 } ] -> { 562f3569c5b8d831367b0585: -1 }
    env.res.own_votes = votes.reduce((acc, vote) => {
      acc[vote.for] = vote.value;
      return acc;
    }, {});
  });


  // Collect users
  //
  N.wire.after(apiPath, function collect_users(env) {
    env.data.users = env.data.users || [];

    if (env.data.topic.del_by) {
      env.data.users.push(env.data.topic.del_by);
    }

    env.data.posts.forEach(post => {
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


  // Sanitize and fill posts
  //
  N.wire.after(apiPath, function* posts_sanitize_and_fill(env) {
    env.res.posts   = yield sanitize_post(N, env.data.posts, env.user_info);
    env.res.topic   = yield sanitize_topic(N, env.data.topic, env.user_info);
    env.res.section = yield sanitize_section(N, env.data.section, env.user_info);
  });
};
