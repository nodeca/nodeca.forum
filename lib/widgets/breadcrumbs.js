"use strict";

/*global nodeca, _*/

module.exports.forum = function (env, parents) {
  var path = [{
    value: env.t('menus.common.topnav.forum'),
    route: 'forum.index'
  }];

  if (_.isArray(parents) && parents.length > 0) {
    parents.forEach(function(parent) {
      path.push({
        value: parent.title,
        route: 'forum.section',
        params: parent
      });
    });
  }
  return path;
};
