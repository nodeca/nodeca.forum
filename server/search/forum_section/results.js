// RPC method used to fetch results and render tabs
//

'use strict';

const memoize = require('promise-memoize');

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


  /*
   * filterVisibility(s_ids, g_ids, callback)
   * - s_ids (array) - subsections ids to filter by access permissions
   * - g_ids (array) - current user groups ids
   *
   * Returns  hash { _id: Boolean(visibility) } for selected subsections
   */
  let filterVisibility = memoize(function (s_ids, g_ids) {
    let access_env = { params: { sections: s_ids, user_info: { usergroups: g_ids } } };

    return N.wire.emit('internal:forum.access.section', access_env).then(() =>
      s_ids.reduce((acc, _id, i) => {
        acc[_id] = access_env.data.access_read[i];
        return acc;
      }, {})
    );
  }, { maxAge: 60000 });


  // Fetch section and subsections (if any)
  //
  N.wire.before(apiPath, async function fetch_subsections(env) {
    if (!env.params.hid) return;

    let section = await N.models.forum.Section.findOne()
                            .where('hid').equals(Number(env.params.hid))
                            .lean(true);

    if (!section) return;

    let subsections = await N.models.forum.Section.getChildren(section._id, Infinity);

    subsections.unshift(section);

    // sections order is always fixed, no needs to sort.
    let s_ids = subsections.map(s => s._id.toString());

    // groups should be sorted, to avoid cache duplication
    let g_ids = env.user_info.usergroups.sort();

    let visibility = await filterVisibility(s_ids, g_ids);

    if (!visibility[section._id]) return;

    subsections = subsections.filter(s => visibility[s._id]);

    let hids = [];

    if (subsections.length > 0) {
      let _subsections = await N.models.forum.Section.find()
                                   .where('_id').in(subsections.map(s => s._id))
                                   .select('hid')
                                   .lean(true);

      hids = hids.concat(_subsections.map(s => s.hid));
    }

    env.data.section = section;
    env.data.section_hids = hids;
  });


  N.wire.on(apiPath, async function search_execute(env) {
    let menu = N.config.search?.forum_section?.menu || {};
    let content_types = Object.keys(menu)
                         .sort((a, b) => (menu[a].priority ?? 100) - (menu[b].priority ?? 100));

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
          period:      Number(env.params.period) || Number(period_types[0]),
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

      let other_tabs = content_types.filter(x => x !== env.params.type);

      await Promise.all(other_tabs.map(async type => {
        let search_env = {
          params: {
            user_info:   env.user_info,
            section_hid: env.data.section_hids || [],
            query:       env.params.query,
            period:      Number(env.params.period) || Number(period_types[0]),
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

    env.res.hid  = env.data.section?.hid;
    env.res.type = env.params.type;
    env.res.skip = env.params.skip;
  });
};
