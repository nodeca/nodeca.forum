// Execute search in forum posts
//
// In:
//
// - params.query
// - params.topic_hid
// - params.section_hid
// - params.sort
// - params.days
// - params.skip
// - params.limit
// - params.user_info
//
// Out:
//
// - count
// - results
// - users
//

'use strict';


const _                = require('lodash');
const sanitize_topic   = require('nodeca.forum/lib/sanitizers/topic');
const sanitize_section = require('nodeca.forum/lib/sanitizers/section');
const sanitize_post    = require('nodeca.forum/lib/sanitizers/post');
const docid_sections   = require('nodeca.forum/lib/search/docid_sections');
const docid_topics     = require('nodeca.forum/lib/search/docid_topics');
const sphinx_escape    = require('nodeca.search').escape;


module.exports = function (N, apiPath) {

  // Send sql query to sphinx, get a response
  //
  N.wire.on(apiPath, function* execute_search(locals) {
    locals.sandbox = locals.sandbox || {};

    let query  = 'SELECT object_id FROM forum_posts WHERE MATCH(?) AND public=1';
    let params = [ sphinx_escape(locals.params.query) ];

    if (locals.params.section_hid) {
      query += ' AND section_uid=?';
      params.push(docid_sections(N, locals.params.section_hid));
    }

    if (locals.params.topic_hid) {
      query += ' AND topic_uid=?';
      params.push(docid_topics(N, locals.params.topic_hid));
    }

    if (locals.params.period > 0) {
      query += ' AND ts > ?';
      // round timestamp to the lowest whole day
      params.push(Math.floor(Date.now() / (24 * 60 * 60 * 1000) - locals.params.period) * 24 * 60 * 60);
    }

    // sort is either `date` or `rel`, sphinx searches by relevance by default
    if (locals.params.sort === 'date') {
      query += ' ORDER BY ts DESC';
    }

    query += ' LIMIT ?,?';
    params.push(locals.params.skip);

    // increase limit by 1 to detect last chunk (only if limit != 0)
    params.push(locals.params.limit ? (locals.params.limit + 1) : 0);

    let reached_end = false;

    let [ results, count ] = yield N.search.execute([
      [ query, params ],
      "SHOW META LIKE 'total_found'"
    ]);

    if (locals.params.limit !== 0) {
      if (results.length > locals.params.limit) {
        results.pop();
      } else {
        reached_end = true;
      }

      let posts = _.keyBy(
        yield N.models.forum.Post.find()
                  .where('_id').in(_.map(results, 'object_id'))
                  .lean(true),
        '_id'
      );

      // copy posts preserving order
      locals.sandbox.posts = results.map(result => posts[result.object_id]).filter(Boolean);

      locals.sandbox.topics = yield N.models.forum.Topic.find()
                                        .where('_id')
                                        .in(_.uniq(locals.sandbox.posts.map(post => String(post.topic))))
                                        .lean(true);

      locals.sandbox.sections = yield N.models.forum.Section.find()
                                          .where('_id')
                                          .in(_.uniq(locals.sandbox.topics.map(topic => String(topic.section))))
                                          .lean(true);
    } else {
      locals.sandbox.posts = [];
      locals.sandbox.topics = [];
      locals.sandbox.sections = [];
    }

    locals.count = Number(count[0].Value);
    locals.reached_end = reached_end;
  });


  // Check permissions for each post
  //
  N.wire.on(apiPath, function* check_permissions(locals) {
    if (!locals.sandbox.posts.length) return;

    let topics_by_id   = _.keyBy(locals.sandbox.topics, '_id');
    let sections_by_id = _.keyBy(locals.sandbox.sections, '_id');

    let topics_used   = {};
    let sections_used = {};

    let access_env = { params: {
      posts: locals.sandbox.posts,
      user_info: locals.params.user_info,
      preload: [].concat(locals.sandbox.topics).concat(locals.sandbox.sections)
    } };

    yield N.wire.emit('internal:forum.access.post', access_env);

    locals.sandbox.posts = locals.sandbox.posts.filter((post, idx) => {
      let topic = topics_by_id[post.topic];
      if (!topic) return;

      let section = sections_by_id[topic.section];
      if (!section) return;

      if (access_env.data.access_read[idx]) {
        topics_used[topic._id] = topic;
        sections_used[section._id] = section;
        return true;
      }

      return false;
    });

    locals.sandbox.topics   = _.values(topics_used);
    locals.sandbox.sections = _.values(sections_used);
  });


  // Sanitize results
  //
  N.wire.on(apiPath, function* sanitize(locals) {
    if (!locals.sandbox.posts.length) return;

    locals.sandbox.posts    = yield sanitize_post(N, locals.sandbox.posts, locals.params.user_info);
    locals.sandbox.topics   = yield sanitize_topic(N, locals.sandbox.topics, locals.params.user_info);
    locals.sandbox.sections = yield sanitize_section(N, locals.sandbox.sections, locals.params.user_info);
  });


  // Fill results
  //
  N.wire.on(apiPath, function fill_results(locals) {
    locals.results = [];

    let topics_by_id = _.keyBy(locals.sandbox.topics, '_id');
    let sections_by_id = _.keyBy(locals.sandbox.sections, '_id');

    locals.sandbox.posts.forEach(post => {
      let topic = topics_by_id[post.topic];
      if (!topic) return;

      let section = sections_by_id[topic.section];
      if (!section) return;

      locals.results.push({ post, topic, section });
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


  // Generate snippets for each post
  //
  N.wire.on(apiPath, function* generate_snippets(locals) {
    if (!locals.results.length) return;

    let htmls = locals.results.map(result => result.post.html);

    let query = `
      CALL SNIPPETS(
        (?${',?'.repeat(htmls.length - 1)}),
        'forum_posts',
        ?,
        '<span class="search-highlight">' AS before_match,
        '</span>' AS after_match,
        'retain' AS html_strip_mode,
        1 AS query_mode,
        0 AS limit
      )`.replace(/\n\s+/mg, '');

    let args = htmls.concat([ sphinx_escape(locals.params.query) ]);

    let snippets = yield N.search.execute(query, args);

    locals.results.forEach((result, i) => {
      result.post.html = snippets[i].snippet;
    });
  });
};
