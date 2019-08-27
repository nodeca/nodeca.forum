// Fetch bookmark data for forum posts
//
// In:
//
// - params.bookmarks - Array of N.models.users.Bookmark objects
// - params.user_info
//
// Out:
//
// - results - array of results corresponding to input bookmarks
// - users - array of user ids needed to fetch
//

'use strict';


const _                = require('lodash');
const sanitize_topic   = require('nodeca.forum/lib/sanitizers/topic');
const sanitize_section = require('nodeca.forum/lib/sanitizers/section');
const sanitize_post    = require('nodeca.forum/lib/sanitizers/post');


module.exports = function (N, apiPath) {

  // Find posts
  //
  N.wire.on(apiPath, async function find_posts(locals) {
    locals.sandbox = {};

    locals.sandbox.posts = await N.models.forum.Post.find()
                                     .where('_id').in(_.map(locals.params.bookmarks, 'src'))
                                     .lean(true);

    locals.sandbox.topics = await N.models.forum.Topic.find()
                                      .where('_id')
                                      .in(_.uniq(locals.sandbox.posts.map(post => String(post.topic))))
                                      .lean(true);

    locals.sandbox.sections = await N.models.forum.Section.find()
                                        .where('_id')
                                        .in(_.uniq(locals.sandbox.posts.map(post => String(post.section))))
                                        .lean(true);
  });


  // Check permissions for each post
  //
  N.wire.on(apiPath, async function check_permissions(locals) {
    if (!locals.sandbox.posts.length) return;

    let topics_by_id   = _.keyBy(locals.sandbox.topics, '_id');
    let sections_by_id = _.keyBy(locals.sandbox.sections, '_id');

    let is_post_public = {};

    let topics_used   = {};
    let sections_used = {};

    let access_env = { params: {
      posts: locals.sandbox.posts,
      user_info: '000000000000000000000000', // guest
      preload: [].concat(locals.sandbox.topics).concat(locals.sandbox.sections)
    } };

    await N.wire.emit('internal:forum.access.post', access_env);

    locals.sandbox.posts = locals.sandbox.posts.filter((post, idx) => {
      let topic = topics_by_id[post.topic];
      if (!topic) return;

      let section = sections_by_id[topic.section];
      if (!section) return;

      if (access_env.data.access_read[idx]) {
        topics_used[topic._id] = topic;
        sections_used[section._id] = section;
        is_post_public[post._id] = true;
        return true;
      }

      return false;
    });

    locals.sandbox.topics   = _.values(topics_used);
    locals.sandbox.sections = _.values(sections_used);

    // Refresh "public" field in bookmarks
    //
    let bulk = N.models.users.Bookmark.collection.initializeUnorderedBulkOp();

    locals.params.bookmarks.forEach(bookmark => {
      if (bookmark.public === !!is_post_public[bookmark.src]) return;

      bulk.find({
        _id: bookmark._id
      }).update({
        $set: {
          'public': !!is_post_public[bookmark.src]
        }
      });
    });

    if (bulk.length > 0) await bulk.execute();
  });


  // Sanitize results
  //
  N.wire.on(apiPath, async function sanitize(locals) {
    if (!locals.sandbox.posts.length) return;

    locals.sandbox.posts    = await sanitize_post(N, locals.sandbox.posts, locals.params.user_info);
    locals.sandbox.topics   = await sanitize_topic(N, locals.sandbox.topics, locals.params.user_info);
    locals.sandbox.sections = await sanitize_section(N, locals.sandbox.sections, locals.params.user_info);
  });


  // Fill results
  //
  N.wire.on(apiPath, function fill_results(locals) {
    locals.results = [];

    let posts_by_id = _.keyBy(locals.sandbox.posts, '_id');
    let topics_by_id = _.keyBy(locals.sandbox.topics, '_id');
    let sections_by_id = _.keyBy(locals.sandbox.sections, '_id');

    locals.params.bookmarks.forEach(bookmark => {
      let post = posts_by_id[bookmark.src];
      if (!post) return;

      let topic = topics_by_id[post.topic];
      if (!topic) return;

      let section = sections_by_id[topic.section];
      if (!section) return;

      locals.results.push({
        _id: bookmark._id,
        type: 'forum_post',
        title: topic.title + (post.hid > 1 ? ' #' + post.hid : ''),
        url: N.router.linkTo('forum.topic', {
          section_hid: section.hid,
          topic_hid: topic.hid,
          post_hid: post.hid
        }),
        post,
        topic,
        section
      });
    });
  });


  // Fill users
  //
  N.wire.on(apiPath, function fill_users(locals) {
    let users = {};

    locals.results.forEach(result => {
      let post = result.post;

      if (post.user) users[post.user] = true;
      if (post.to_user) users[post.to_user] = true;
      if (post.del_by) users[post.del_by] = true;
      if (post.import_users) post.import_users.forEach(id => { users[id] = true; });
    });

    locals.users = Object.keys(users);
  });
};
