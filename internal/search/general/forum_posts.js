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


module.exports = function (N, apiPath) {

  // Character list is taken from:
  // http://sphinxsearch.com/forum/view.html?id=10003
  function sphinx_escape(query) {
    return query.replace(/[\\()|\-!@~"&/^$=]/g, '\\$1');
  }

  // Hook to register search type
  //
  N.wire.before('server:search.general.list', function register_forum_post_search(env) {
    env.data.content_types.push('forum_posts');
  });


  // Execute actual search
  //
  N.wire.on(apiPath, function* execute_search(locals) {
    let results = yield N.search.execute([
      [
        // TODO: skip/limit, ordering, permissions
        'SELECT objectid FROM forum_posts WHERE MATCH(?) LIMIT 0',
        [ sphinx_escape(locals.params.query) ]
      ],
      "SHOW META LIKE 'total_found'"
    ]);

    locals.count = Number(results[1][0].Value);
  });
};
