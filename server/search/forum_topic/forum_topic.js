// Forum topic search placeholder page, shows search input only;
// it doesn't return any results to prevent heavy load from bots
//

'use strict';

const sort_types   = [ 'date', 'rel' ];
const period_types = [ '0', '7', '30', '365' ];


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    $query: {
      type: 'object',
      required: true,
      properties: {
        hid:    { type: 'string', required: true },
        query:  { type: 'string' },
        sort:   { 'enum': sort_types },
        period: { 'enum': period_types }
      }
    }
  });

  N.wire.on(apiPath, function search_general(env) {
    env.res.head.title = env.t('title');
    env.res.head.robots = 'noindex,nofollow';

    if (env.params.$query) {
      let query = env.params.$query;

      env.res.query  = query.query;
      env.res.sort   = query.sort;
      env.res.period = query.period;
      env.res.hid    = Number(query.hid);
    }

    // there are no tabs for search inside topic,
    // so only one content type possible
    env.res.type = 'forum_posts';

    env.res.sort_types    = sort_types;
    env.res.period_types  = period_types;

    // an amount of search results loaded at once,
    // it is expected to be overriden for different content types
    env.res.items_per_page = 40;
  });
};
