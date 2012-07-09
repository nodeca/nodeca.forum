"use strict";

/*global nodeca, _*/
var NLib = require('nlib');

var Async = NLib.Vendor.Async;


var build_tree = module.exports.build_tree = function(source, root, deep) {
  var result = [];
  var node;
  var node_parent;
  var id;

  if (!_.isArray(source)) {
    source = _.values(source);
  }

  root = !!root ? root.toString() : null;

  for (var key=0; key < source.length; key++) {
    node = source[key];
    if (node !== undefined) {
      node_parent = !!node.parent ? node.parent.toString() : null;
      if (node_parent === root) {
        id = node._id.toString();

        if (deep === null || deep > 0) {
          node.child_list = build_tree(source, id, deep-1);
        }

        result.push(node);
        delete(source[key]);
      }
    }
  }
  // ToDo sort elements by display order
  return result;
};


module.exports = function (schema, options) {
  schema.statics.build_tree = function(env, root, deep, callback) {
    this.fetchSections(env, {}, function(err){
      if (err) {
        callback(err);
        return;
      }
      env.response.data.sections = build_tree(env.data.sections.slice(), root, deep);
      callback(err);
    });
  };
};

