"use strict";


/**
 *  forum_breadcrumbs(env, parents) -> array
 *  - env (object): Base env object
 *  - parents (array): each element is record from Sections collection
 *
 *  Build array of breadcrumbs.
 *
 *  ##### Breadcrumb
 *
 *  - **text**: Link text
 *  - **route**: Base link route
 *  - **params**: Route params. Optional parameter
 **/
module.exports = function (env, parents) {

  // first element - always link to forum root
  var path = [{
    text: env.helpers.t('common.menus.navbar.forum'),
    route: 'forum.index'
  }];

  if (!!parents) {
    parents.forEach(function (parent) {
      path.push({
        text: parent.title,
        route: 'forum.section',
        params: { id: parent.id }
      });
    });
  }
  return path;
};
