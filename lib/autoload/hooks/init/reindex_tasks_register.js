// Add tasks to run during reindex
//

'use strict';


module.exports = function (N) {
  N.wire.on('internal:search.reindex.tasklist', function reindex_add_forum_tasks(locals) {
    locals.push('forum_topics_reindex');
    locals.push('forum_posts_reindex');
  });
};
