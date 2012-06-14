"use strict";

/*global nodeca, _*/

module.exports.forum = function (env, parents) {
  var path = [[env.t('common.home'), 'forum.index', {}]];

  if (_.isArray(parents) && parents.length > 0) {
    parents.forEach(function(parent) {
      path.push([parent.title, 'forum.section.show', parent]);
    });
  }
  return path;
};
