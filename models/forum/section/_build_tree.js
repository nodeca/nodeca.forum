"use strict";

/*global nodeca, _*/

var build_tree = module.exports.build_tree = function(source, root, deep, iterator) {
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
          node.child_list = build_tree(source, id, deep-1, iterator);
        }
        iterator(node);
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
    env.response.data.sections = [];
    if (!_.isArray(env.data.users)) {
      env.data.users = [];
    }

    var fields = [
      '_id', 'id', 'title', 'description', 'parent',
      'parent_id_list', 'redirect', 'moderator_list', 'display_order'
    ];

    // ToDo real vs hb
    fields.push('cache.real');

    var query = {};
    // ToDo get state conditions from env
    this.find(query).select(fields.join(' ')).setOptions({lean:true}).exec(function(err, docs){
      if (err) {
        callback(err);
        return;
      }
  
      env.response.data.sections = build_tree(docs, root, deep, function(doc){
        if (doc.moderator_list && _.isArray(doc.moderator_list)) {
          doc.moderator_list.forEach(function(user) {
            env.data.users.push(user);
          });
        }
        if (doc.cache.real.last_user) {
          env.data.users.push(doc.cache.real.last_user);
        }
      });
      callback(err);
    });
  };
};
