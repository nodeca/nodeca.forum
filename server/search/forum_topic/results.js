// RPC method used to fetch results and render tabs
//

'use strict';

const _  = require('lodash');

const sort_types   = [ 'date', 'rel' ];
const period_types = [ '0', '7', '30', '365' ];

// Maximum offset (should be the same as `max_matches` in sphinx),
// client MAY send higher skip, we just return zero results in that case.
//
const MAX_SKIP = 1000;

// Maximum size of one result chunk, it's just a safeguard because
// client never sends invalid limit value.
//
const MAX_LIMIT = 50;


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    properties: {
      hid:    { type: 'string',  required: true },
      query:  { type: 'string',  required: true },
      skip:   { type: 'integer', required: true, minimum: 0 },
      limit:  { type: 'integer', required: true, minimum: 0, maximum: MAX_LIMIT },
      sort:   { 'enum': sort_types,   required: false },
      period: { 'enum': period_types, required: false }
    }
  });


  N.wire.on(apiPath, async function search_execute(env) {
    // there are no tabs for search inside topic,
    // so only one content type possible
    env.params.type = 'forum_posts';

    // check query length because 1-character requests consume too much resources
    if (env.params.query.trim().length < 2) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_query_too_short')
      };
    }

    if (env.params.skip < MAX_SKIP) {
      let search_env = {
        params: {
          user_info: env.user_info,
          query:     env.params.query,
          topic_hid: _.toFinite(env.params.hid),
          period:    _.toFinite(env.params.period) || _.toFinite(period_types[0]),
          sort:      env.params.sort ? env.params.sort : sort_types[0],
          limit:     env.params.limit,
          skip:      env.params.skip
        }
      };

      await N.wire.emit('internal:search.' + env.params.type, search_env);

      env.res.results = search_env.results;
      env.res.reached_end = search_env.reached_end;
      env.data.users = (env.data.users || []).concat(search_env.users);
    } else {
      env.res.results = [];
      env.res.reached_end = true;
    }

    env.res.hid  = _.toFinite(env.params.hid);
    env.res.type = env.params.type;
  });
};
