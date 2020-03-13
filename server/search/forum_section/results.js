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
      type:   { type: 'string',  required: false },
      skip:   { type: 'integer', required: true, minimum: 0 },
      limit:  { type: 'integer', required: true, minimum: 0, maximum: MAX_LIMIT },
      sort:   { enum: sort_types,   required: false },
      period: { enum: period_types, required: false }
    }
  });


  // Fetch section and subsections (if any)
  //
  N.wire.before(apiPath, async function fetch_section(env) {
    if (!env.params.hid) return;

    let section = await N.models.forum.Section.findOne()
                            .where('hid').equals(_.toFinite(env.params.hid))
                            .lean(true);

    if (!section) return;

    let children = await N.models.forum.Section.getChildren(section._id, Infinity);

    let hids = [ section.hid ];

    if (children.length > 0) {
      let s = await N.models.forum.Section.find()
                        .where('_id').in(_.map(children, '_id'))
                        .select('hid')
                        .lean(true);

      hids = hids.concat(_.map(s, 'hid'));
    }

    env.data.section = section;
    env.data.section_hids = hids;
  });


  N.wire.on(apiPath, async function search_execute(env) {
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
          section_hid: env.data.section_hids || [],
          query:       env.params.query,
          period:      _.toFinite(env.params.period) || _.toFinite(period_types[0]),
          sort:        env.params.sort ? env.params.sort : sort_types[0],
          limit:       env.params.limit,
          skip:        env.params.skip
        }
      };

      await N.wire.emit('internal:search.' + env.params.type, search_env);

      env.res.results = search_env.results;
      env.res.reached_end = search_env.reached_end;
      env.data.users = (env.data.users || []).concat(search_env.users);

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

      await Promise.all(other_tabs.map(async type => {
        let search_env = {
          params: {
            user_info:   env.user_info,
            section_hid: env.data.section_hids || [],
            query:       env.params.query,
            period:      _.toFinite(env.params.period) || _.toFinite(period_types[0]),
            sort:        env.params.sort ? env.params.sort : sort_types[0],
            limit:       0,
            skip:        0
          }
        };

        await N.wire.emit('internal:search.' + type, search_env);

        counts[type] = search_env.count;
      }));

      env.res.tabs = content_types.map(type => ({
        type,
        count: counts[type]
      }));
    }

    env.res.hid  = env.data.section && env.data.section.hid;
    env.res.type = env.params.type;
    env.res.skip = env.params.skip;
  });
};
