// Execute search in forum topics
//
// In:
//
// - params.query
// - params.section_hid
// - params.sort
// - params.period
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
const docid_sections   = require('nodeca.forum/lib/search/docid_sections');
const sphinx_escape    = require('nodeca.search').escape;


module.exports = function (N, apiPath) {

  // Send sql query to sphinx, get a response
  //
  N.wire.on(apiPath, async function execute_search(locals) {
    locals.sandbox = locals.sandbox || {};

    let query  = 'SELECT object_id FROM forum_topics WHERE MATCH(?)';
    let params = [ sphinx_escape(locals.params.query) ];

    // Search across public messages by default unless section hid is specified
    let allow_search_private = false;

    if (locals.params.section_hid) {
      let hids = locals.params.section_hid;
      if (!Array.isArray(hids)) hids = [ hids ];

      if (hids.length > 0) {
        query += ` AND section_uid IN (${Array(hids.length).fill('?').join(',')})`;
        params = params.concat(hids.map(hid => docid_sections(N, hid)));
        allow_search_private = true;
      }
    }

    if (locals.params.period > 0) {
      query += ' AND ts > ?';
      // round timestamp to the lowest whole day
      params.push(Math.floor(Date.now() / (24 * 60 * 60 * 1000) - locals.params.period) * 24 * 60 * 60);
    }

    // search everything public (available to guests) by default;
    // if we have section list with checked permissions, search everything
    query += allow_search_private ? ' AND visible=1' : ' AND public=1';

    // sort is either `date` or `rel`, sphinx searches by relevance by default
    if (locals.params.sort === 'date') {
      query += ' ORDER BY ts DESC';
    }

    query += ' LIMIT ?,?';
    params.push(locals.params.skip);

    // increase limit by 1 to detect last chunk (only if limit != 0)
    params.push(locals.params.limit ? (locals.params.limit + 1) : 0);

    let reached_end = false;

    let [ results, count ] = await N.search.execute([
      [ query, params ],
      "SHOW META LIKE 'total_found'"
    ]);

    if (locals.params.limit !== 0) {
      if (results.length > locals.params.limit) {
        results.pop();
      } else {
        reached_end = true;
      }

      let topics = _.keyBy(
        await N.models.forum.Topic.find()
                  .where('_id').in(results.map(r => r.object_id))
                  .lean(true),
        '_id'
      );

      // copy topics preserving order
      locals.sandbox.topics = results.map(result => topics[result.object_id]).filter(Boolean);

      locals.sandbox.sections = await N.models.forum.Section.find()
                                          .where('_id')
                                          .in(_.uniq(locals.sandbox.topics.map(topic => String(topic.section))))
                                          .lean(true);
    } else {
      locals.sandbox.topics = [];
      locals.sandbox.sections = [];
    }

    locals.count = Number(count[0].Value);
    locals.reached_end = reached_end;
  });


  // Check permissions for each topic
  //
  N.wire.on(apiPath, async function check_permissions(locals) {
    if (!locals.sandbox.topics.length) return;

    let access_env = { params: {
      topics: locals.sandbox.topics,
      user_info: locals.params.user_info,
      preload: locals.sandbox.sections
    } };

    await N.wire.emit('internal:forum.access.topic', access_env);

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

    locals.sandbox.sections = Object.values(sections_used);
  });


  // Sanitize results
  //
  N.wire.on(apiPath, async function sanitize(locals) {
    if (!locals.sandbox.topics.length) return;

    locals.sandbox.topics   = await sanitize_topic(N, locals.sandbox.topics, locals.params.user_info);
    locals.sandbox.sections = await sanitize_section(N, locals.sandbox.sections, locals.params.user_info);
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

      if (topic.cache.first_user) users[topic.cache.first_user] = true;
      if (topic.cache.last_user) users[topic.cache.last_user] = true;
      if (topic.del_by) users[topic.del_by] = true;
    });

    locals.users = Object.keys(users);
  });
};
