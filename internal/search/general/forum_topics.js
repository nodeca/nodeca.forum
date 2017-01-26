// Execute search in forum topics
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
const sanitize_topic   = require('nodeca.forum/lib/sanitizers/topic');
const sanitize_section = require('nodeca.forum/lib/sanitizers/section');


module.exports = function (N, apiPath) {

  // Character list is taken from:
  // http://sphinxsearch.com/forum/view.html?id=10003
  function sphinx_escape(query) {
    return query.replace(/[\\()|\-!@~"&/^$=]/g, '\\$1');
  }


  // Send sql query to sphinx, get a response
  //
  N.wire.on(apiPath, function* execute_search(locals) {
    locals.sandbox = locals.sandbox || {};

    let query  = 'SELECT object_id FROM forum_topics WHERE MATCH(?) AND public=1';
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

    let topics = _.keyBy(
      yield N.models.forum.Topic.find()
                .where('_id').in(_.map(results[0], 'object_id'))
                .lean(true),
      '_id'
    );

    // copy topics preserving order
    locals.sandbox.topics = results[0].map(result => topics[result.object_id]).filter(Boolean);

    locals.sandbox.sections = yield N.models.forum.Section.find()
                                        .where('_id')
                                        .in(_.uniq(locals.sandbox.topics.map(topic => String(topic.section))))
                                        .lean(true);

    locals.count = Number(results[1][0].Value);
  });


  // Check permissions for each topic
  //
  N.wire.on(apiPath, function* check_permissions(locals) {
    let access_env = { params: { topics: locals.sandbox.topics, user_info: locals.params.user_info } };

    yield N.wire.emit('internal:forum.access.topic', access_env);

    let sections_by_id = _.keyBy(locals.sandbox.sections, '_id');
    let sections_used = {};

    locals.sandbox.topics = locals.sandbox.topics.filter((topic, idx) => {
      let section = sections_by_id[topic.section];
      if (!section) return false;

      if (access_env.data.access_read[idx]) {
        sections_used[section._id] = section;
        return true;
      }

      return false;
    });

    locals.sandbox.sections = _.values(sections_used);
  });


  // Sanitize results
  //
  N.wire.on(apiPath, function* sanitize(locals) {
    locals.sandbox.topics   = yield sanitize_topic(N, locals.sandbox.topics, locals.params.user_info);
    locals.sandbox.sections = yield sanitize_section(N, locals.sandbox.sections, locals.params.user_info);
  });


  // Fill results
  //
  N.wire.on(apiPath, function fill_results(locals) {
    locals.results = [];

    let sections_by_id = _.keyBy(locals.sandbox.sections, '_id');

    locals.sandbox.topics.forEach(topic => {
      let section = sections_by_id[topic.section];
      if (!section) return;

      locals.results.push({ topic, section });
    });
  });


  // Fill users
  //
  N.wire.on(apiPath, function fill_users(locals) {
    let users = {};

    locals.results.forEach(result => {
      let topic = result.topic;

      users[topic.cache.first_user] = true;
      users[topic.cache.last_user] = true;

      if (topic.del_by) users[topic.del_by] = true;
    });

    locals.users = Object.keys(users);
  });
};
