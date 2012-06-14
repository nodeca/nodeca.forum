"use strict";

/*global nodeca, _*/

module.exports.forum = function (env, parents, current) {
  var path = [];
  var root = env.t('common.home');
  if (!current) {
    current = root;
  }
  else {
    path = [[root, 'forum.index', {}]];
  }
  if (_.isArray(parents) && parents.length > 0) {
    parents.forEach(function(parent) {
      path.push([parent.title, 'forum.section.show', parent]);
    });
  }
  return {
    path: path,
    current: current
  };
};
