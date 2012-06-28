// forum helper
"use strict";

/*global nodeca, _*/

// build three from sections list
var build_tree = module.exports.build_tree = function(source, root) {
  var result = [];
  var node;

  root = root || null;

  var id;
  for (var key=0; key < source.length; key++) {
    node = source[key];

    if (node !== undefined && node.parent === root) {
      id = node._id;

      node.child_list = build_tree(source, id);
      result.push(node);
      delete(source[key]);
    }
  }
  // ToDo sort elements by display order
  return result;
};

// build path to avatar
module.exports.build_avatar_path = function (avatar_version) {
  // ToDo
  return 'http://lorempixel.com/150/150/sports/a' + avatar_version;
};
