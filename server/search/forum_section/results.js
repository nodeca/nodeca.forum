// RPC method used to fetch results and render tabs
//

'use strict';

const _       = require('lodash');
const Promise = require('bluebird');

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
      type:   { type: 'string',  required: false },
      skip:   { type: 'integer', required: true, minimum: 0 },
      limit:  { type: 'integer', required: true, minimum: 0, maximum: MAX_LIMIT },
      sort:   { 'enum': sort_types,   required: false },
      period: { 'enum': period_types, required: false }
    }
  });


  N.wire.on(apiPath, function* search_execute(env) {
    let menu = _.get(N.config, 'search.forum_section.menu', {});
    let content_types = Object.keys(menu)
                         .sort((a, b) => (menu[a].priority || 100) - (menu[b].priority || 100));

    // if type is not specified, select first one
    if (!env.params.type) {
      env.params.type = content_types[0];
    }

    // validate content type
    if (content_types.indexOf(env.params.type) === -1) {
      throw N.io.BAD_REQUEST;
    }

    // check query length because 1-character requests consume too much resources
    if (env.params.query.trim().length < 2) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_query_too_short')
      };
    }

    let active_tab_count;

    if (env.params.skip < MAX_SKIP) {
      let search_env = {
        params: {
          user_info:   env.user_info,
          section_hid: Number(env.params.hid),
          query:       env.params.query,
          period:      env.params.period ? Number(env.params.period) : Number(period_types[0]),
          sort:        env.params.sort ? env.params.sort : sort_types[0],
          limit:       env.params.limit,
          skip:        env.params.skip
        }
      };

      yield N.wire.emit('internal:search.' + env.params.type, search_env);

      env.res.results = search_env.results;
      env.res.reached_end = search_env.reached_end;
      env.data.users = (env.res.users || []).concat(search_env.users);

      active_tab_count = search_env.count;
    } else {
      env.res.results = [];
      env.res.reached_end = true;
    }

    // calculate result counts for other tabs (first page only)
    if (env.params.skip === 0) {
      let counts = {};

      // set result count for current tab
      counts[env.params.type] = active_tab_count;

      let other_tabs = _.without(content_types, env.params.type);

      yield Promise.map(other_tabs, Promise.coroutine(function* (type) {
        let search_env = {
          params: {
            user_info:   env.user_info,
            section_hid: Number(env.params.hid),
            query:       env.params.query,
            period:      env.params.period ? Number(env.params.period) : Number(period_types[0]),
            sort:        env.params.sort ? env.params.sort : sort_types[0],
            limit:       0,
            skip:        0
          }
        };

        yield N.wire.emit('internal:search.' + type, search_env);

        counts[type] = search_env.count;
      }));

      env.res.tabs = content_types.map(type => ({
        type,
        count: counts[type]
      }));
    }

    env.res.hid  = Number(env.params.hid);
    env.res.type = env.params.type;
  });
};
