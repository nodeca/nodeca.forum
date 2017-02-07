// Execute search in forum posts
//
// In:
//
// - params.query
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
const Promise          = require('bluebird');
const sanitize_topic   = require('nodeca.forum/lib/sanitizers/topic');
const sanitize_section = require('nodeca.forum/lib/sanitizers/section');
const sanitize_post    = require('nodeca.forum/lib/sanitizers/post');
const sphinx_escape    = require('nodeca.search').escape;


module.exports = function (N, apiPath) {

  // Send sql query to sphinx, get a response
  //
  N.wire.on(apiPath, function* execute_search(locals) {
    locals.sandbox = locals.sandbox || {};

    let query  = 'SELECT object_id FROM forum_posts WHERE MATCH(?) AND public=1';
    let params = [ sphinx_escape(locals.params.query) ];

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
    params.push(locals.params.limit);

    let results = yield N.search.execute([
      [ query, params ],
      "SHOW META LIKE 'total_found'"
    ]);

    let posts = _.keyBy(
      yield N.models.forum.Post.find()
                .where('_id').in(_.map(results[0], 'object_id'))
                .lean(true),
      '_id'
    );

    // copy posts preserving order
    locals.sandbox.posts = results[0].map(result => posts[result.object_id]).filter(Boolean);

    locals.sandbox.topics = yield N.models.forum.Topic.find()
                                      .where('_id')
                                      .in(_.uniq(locals.sandbox.posts.map(post => String(post.topic))))
                                      .lean(true);

    locals.sandbox.sections = yield N.models.forum.Section.find()
                                        .where('_id')
                                        .in(_.uniq(locals.sandbox.topics.map(topic => String(topic.section))))
                                        .lean(true);

    locals.count = Number(results[1][0].Value);
  });


  // Check permissions for each post
  //
  N.wire.on(apiPath, function* check_permissions(locals) {
    let topics_by_id   = _.keyBy(locals.sandbox.topics, '_id');
    let sections_by_id = _.keyBy(locals.sandbox.sections, '_id');

    let topics_used   = {};
    let sections_used = {};

    locals.sandbox.posts = (yield Promise.map(locals.sandbox.posts, Promise.coroutine(function* (post) {
      let topic = topics_by_id[post.topic];
      if (!topic) return;

      let section = sections_by_id[topic.section];
      if (!section) return;

      topics_used[topic._id] = topic;
      sections_used[section._id] = section;

      let access_env = { params: {
        topic,
        posts: post,
        user_info: locals.params.user_info
      } };

      yield N.wire.emit('internal:forum.access.post', access_env);

      return access_env.data.access_read ? post : null;
    }))).filter(Boolean);

    locals.sandbox.topics   = _.values(topics_used);
    locals.sandbox.sections = _.values(sections_used);
  });


  // Sanitize results
  //
  N.wire.on(apiPath, function* sanitize(locals) {
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

    let htmls = locals.results.map(result =>
      // workaround to display astral characters (e.g. smilies) properly;
      // `mysql2` module replaces them with 4 U+FFFD, `mysql` module works
      // correctly (tested with mysql@1.1.2, sphinx@2.3.3-id64-dev)
      result.post.html.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ch => '&#x' + ch.codePointAt(0).toString(16) + ';'));

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
