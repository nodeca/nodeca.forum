"use strict";

/*global nodeca, _*/

var fields = {
  '_id' : 1,
  'id' : 1,
  'title' : 1,
  'description' : 1,
  'parent' : 1,
  'parent_list' : 1,
  'parent_id_list' : 1,
  'redirect' : 1,
  'moderator_list' : 1,
  'display_order' : 1,
  'cache' : 1
};

function to_tree(source, root) {
  var result = [];
  var nodes = {};

  source.forEach(function(node) {
    node.child_list = [];
    nodes[node._id.toString()] = node;
  });

  root = !!root ? root.toString() : null;

  if (!!root) {
    root = root.toString();
    if (!nodes[root]) {
      nodes[root] = {child_list: []};
    }
  }
  else {
    root = null;
  }

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
}

function collect_users(env, docs) {
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
}

module.exports = function (schema, options) {
  schema.statics.build_tree = function(env, root, max_level, callback) {
    env.extras.puncher.start('build tree call');

    env.extras.puncher.start('build tree: fetch sections');
    env.response.data.sections = [];
    if (!_.isArray(env.data.users)) {
      env.data.users = [];
    }

    var query = {level: {$lte: max_level}};
    
    if (root !== null) {
      query['parent_list'] = root;
    }

    // ToDo get state conditions from env
    this.find(query).select(fields).sort('display_order')
        .setOptions({lean:true}).exec(function(err, docs){
      if (err) {
        env.extras.puncher.stop();
        env.extras.puncher.stop();
        callback(err);
        return;
      }

      env.extras.puncher.stop({ count: docs.length });

      env.extras.puncher.start('build tree: prepare tree');
      env.response.data.sections = to_tree(docs, root);
      env.extras.puncher.stop();

      env.extras.puncher.start('build tree: collect users');
      collect_users(env, docs);
      env.extras.puncher.stop();

      env.extras.puncher.stop();
      callback(err);
    });
  };
};
