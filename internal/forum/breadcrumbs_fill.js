// Fill breadcrumbs data in response for forum pages
//
'use strict';


var _         = require('lodash');
var memoizee  = require('memoizee');


module.exports = function (N, apiPath) {

  // Helper - cacheable bredcrumbs info fetch, to save DB request.
  // We can cache it, because cache size is limited by sections count.
  var fetchSectionsInfo = memoizee(

    function (ids, callback) {
      var result = [];

      N.models.forum.Section
        .find({ _id: { $in: ids } })
        .select('hid title')
        .lean(true)
        .exec(function (err, parents) {

          // sort result in the same order as ids
          _.forEach(ids, function(id) {
            var foundParent = _.find(parents, function(parent) {
              return parent._id.equals(id);
            });
            result.push(foundParent);
          });

          callback(err, result);
        });
    },
    {
      async: true,
      maxAge:     60000, // cache TTL = 60 seconds
      primitive:  true   // params keys are calculated as toString, ok for our case
    }
  );

  // data = { env, parents }
  // parents - array of forums ids to show in breadcrumbs
  N.wire.on(apiPath, function internal_breadcrumbs_fill(data, callback) {
    var env     = data.env;
    var parents = data.parents;

    env.extras.puncher.start('build breadcrumbs');

    env.res.blocks = env.res.blocks || {};

    // first element - always link to forum root
    env.res.blocks.breadcrumbs = [ {
      text: env.t('@common.menus.navbar.forum'),
      route: 'forum.index'
    } ];

    // no parents - we are on the root
    if (_.isEmpty(parents)) {
      env.extras.puncher.stop();
      callback();
      return;
    }

    fetchSectionsInfo(parents, function (err, parentsInfo) {
      if (err) {
        callback(err);
        return;
      }

      var bc_list = parentsInfo.slice(); // clone result to keep cache safe

      // transform fetched data & glue to output
      env.res.blocks.breadcrumbs = env.res.blocks.breadcrumbs.concat(
        _.map(bc_list, function(section_info) {
          return {
            text: section_info.title,
            route: 'forum.section',
            params: { hid: section_info.hid }
          };
        })
      );

      env.extras.puncher.stop();

      callback();
    });
  });
};
