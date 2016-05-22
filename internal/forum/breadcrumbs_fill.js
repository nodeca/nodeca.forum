// Fill breadcrumbs data in response for forum pages
//
'use strict';


const _       = require('lodash');
const memoize = require('promise-memoize');


module.exports = function (N, apiPath) {

  // Helper - cacheable bredcrumbs info fetch, to save DB request.
  // We can cache it, because cache size is limited by sections count.
  let fetchSectionsInfo = memoize(
    ids => N.models.forum.Section
      .find({ _id: { $in: ids } })
      .select('hid title')
      .lean(true)
      .exec()
      .then(parents => {
        let result = [];

        // sort result in the same order as ids
        _.forEach(ids, id => {
          result.push(_.find(parents, p => p._id.equals(id)));
        });

        return result;
      }),
    { maxAge: 60000 }
  );

  // data = { env, parents }
  // parents - array of forums ids to show in breadcrumbs
  N.wire.on(apiPath, function* internal_breadcrumbs_fill(data) {
    let env     = data.env;
    let parents = data.parents;

    // first element - always link to forum root
    env.res.breadcrumbs = [ {
      text: env.t('@common.menus.navbar.forum'),
      route: 'forum.index'
    } ];

    // no parents - we are on the root
    if (_.isEmpty(parents)) return;

    let parentsInfo = yield fetchSectionsInfo(parents);

    let bc_list = parentsInfo.slice(); // clone result to keep cache safe

    // transform fetched data & glue to output
    env.res.breadcrumbs = env.res.breadcrumbs.concat(
      _.map(bc_list, function (section_info) {
        return {
          text: section_info.title,
          route: 'forum.section',
          params: { section_hid: section_info.hid }
        };
      })
    );
  });
};
