"use strict";

/*global nodeca, _*/

module.exports.forum = function (env, parents) {
  var path = [{
    text: env.helpers.t('common.menus.topnav.forum'),
    route: 'forum.index'
  }];

  if (_.isArray(parents) && parents.length > 0) {
    parents.forEach(function(parent) {
      path.push({
        text: parent.title,
        route: 'forum.section',
        params: {id: parent.id}
      });
    });
  }
  return path;
};
