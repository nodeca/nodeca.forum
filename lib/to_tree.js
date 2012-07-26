"use strict";

/*global nodeca, _*/

/**
 *  to_tree(source[, root = null]) -> array
 *  - source (array): array of sections
 *  - root (mongodb.BSONPure.ObjectID|String): id of common root for result first level.
 *
 *  Build sections tree from source array.
 **/
module.exports = function (source, root) {
  if (!source || !source.length) {
    return null;
  }

  var result = [];
  var nodes = {};

  source.forEach(function(node) {
    node.child_list = [];
    nodes[node._id.toString()] = node;
  });

  root = !!root ? root.toString() : null;

  // if root set, but not exists in source array,
  // then create fake section
  if (!!root) {
    if (!nodes[root]) {
      nodes[root] = {child_list: []};
    }
  }

  // set children links for all nodes
  // and collect root children to result array
  source.forEach(function(node) {
    node.parent = !!node.parent ? node.parent.toString() : null;

    if (node.parent === root) {
      result.push(node);
    }

    if (node.parent !== null) {
      nodes[node.parent].child_list.push(node);
    }
  });
  return result;
};
