"use strict";

/*global nodeca, _*/


function build_tree(source, root) {
  var result = [];
  var nodes = {};

  source.forEach(function(node) {
    node.child_list = [];
    nodes[node._id.toString()] = node;
  });

  root = !!root ? root.toString() : null;

  source.forEach(function(node) {
    node.parent = !!node.parent ? node.parent.toString() : null;

    if (node.parent == root) {
      result.push(node);
    }

    if (node.parent !== null) {

      nodes[node.parent].child_list.push(node);
    }
  });
  return result;
}



module.exports = function (schema, options) {
  schema.statics.build_tree = function(env, root, callback) {
    env.extras.puncher.start('build tree call');

    env.response.data.sections = [];
    if (!_.isArray(env.data.users)) {
      env.data.users = [];
    }

    var fields = [
      '_id', 'id', 'title', 'description', 'parent', 'parent_list',
      'parent_id_list', 'redirect', 'moderator_list', 'display_order', 'cache'
    ];

    var query = {};
    // ToDo get state conditions from env
    this.find(query).select(fields.join(' ')).sort('display_order').setOptions({lean:true}).exec(function(err, docs){
      if (err) {
        env.extras.puncher.stop();
        callback(err);
        return;
      }

      env.response.data.sections = build_tree(docs, root);
      
      docs.forEach(function(doc){
        if (doc.moderator_list && _.isArray(doc.moderator_list)) {
          doc.moderator_list.forEach(function(user) {
            env.data.users.push(user);
          });
        }
        if (doc.cache.real.last_user) {
          env.data.users.push(doc.cache.real.last_user);
        }
      });
      env.extras.puncher.stop({ count: docs.length });
      callback(err);
    });
  };
};
