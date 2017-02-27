
'use strict';


module.exports = function (N) {

  N.wire.after([
    'server:search.general',
    'server:search.forum_section',
    'server:search.forum_topic'
  ], function* inject_search_per_page(env) {
    if (env.res.type === 'forum_topics') {
      env.res.items_per_page = yield env.extras.settings.fetch('topics_per_page');
    }

    if (env.res.type === 'forum_posts') {
      env.res.items_per_page = yield env.extras.settings.fetch('posts_per_page');
    }
  });
};
