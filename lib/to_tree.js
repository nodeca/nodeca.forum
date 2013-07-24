"use strict";

/**
 *  to_tree(source[, root = null]) -> array
 *  - source (array): array of sections
 *  - root (mongodb.BSONPure.ObjectID|String): id of common root for result first level.
 *
 *  Build sections tree (nested) from flat sorted array.
 **/
module.exports = function (source, root) {
  var result = [];
  var nodes = {};

  source.forEach(function (node) {
    node.child_list = [];
    nodes[node._id.toString()] = node;
  });

  root = !!root ? root.toString() : null;

  // set children links for all nodes
  // and collect root children to result array
  source.forEach(function (node) {
    node.parent = !!node.parent ? node.parent.toString() : null;

    if (node.parent === root) {
      result.push(node);

    } else if (node.parent !== null) {
      // Add child node if parent node actually exists.
      // It may not if we deal with nested forum sections where visible
      // section is a descendant of invisible section.
      if (nodes[node.parent]) {
        nodes[node.parent].child_list.push(node);
      }
    }
  });

  return result;
};
