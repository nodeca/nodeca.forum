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


  // Execute actual search
  //
  N.wire.on(apiPath, function* execute_search(locals) {
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

    let topics = yield N.models.forum.Topic.find()
                           .where('_id').in(_.map(results[0], 'object_id'))
                           .lean(true);

    let sections = yield N.models.forum.Section.find()
                             .where('_id').in(_.map(topics, 'section'))
                             .lean(true);

    let topics_by_id   = _.keyBy(topics, '_id');

    let topics_sanitized   = _.keyBy(yield sanitize_topic(N, topics, locals.params.user_info), '_id');
    let sections_sanitized = _.keyBy(yield sanitize_section(N, sections, locals.params.user_info), '_id');

    let users = {};

    let access_env = { params: { topics, user_info: locals.params.user_info } };

    yield N.wire.emit('internal:forum.access.topic', access_env);

    let is_topic_visible = {};

    topics.forEach((topic, idx) => {
      is_topic_visible[topic._id] = !!access_env.data.access_read[idx];
    });

    locals.results = [];

    for (let { object_id } of results[0]) {
      if (!is_topic_visible[object_id]) continue;

      let topic = topics_by_id[object_id];
      if (!topic) continue;

      users[topic.cache.first_user] = true;
      users[topic.cache.last_user] = true;

      if (topic.del_by) users[topic.del_by] = true;

      locals.results.push({
        topic:   topics_sanitized[topic._id],
        section: sections_sanitized[topic.section]
      });
    }

    locals.users = Object.keys(users);
    locals.count = Number(results[1][0].Value);
  });
};
