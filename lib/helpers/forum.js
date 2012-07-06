// forum helper
"use strict";

/*global nodeca, _*/

module.exports.prepare_section_display_info = function(section, user_id_list) {
  // ToDo check permissions
  var doc = section._doc;
  doc._id = doc._id.toString();
  if (doc.parent) {
    doc.parent = doc.parent.toString();
  }
  else {
    doc.parent = null;
  }
  var moderators = doc.moderator_list.map(function(user) {
    user_id_list.push( user.toString());
    return user.toString();
  });

  if (doc.cache.real.last_user) {
    user_id_list.push(doc.cache.real.last_user.toString());
  }

  // ToDo replace real for hb users
  return {
    _id:              doc._id,
    id:               doc.id,
    title:            doc.title,
    description:      doc.description,
    parent:           doc.parent,
    redirect:         doc.redirect,
    moderators:       moderators,
    thread_count:     doc.cache.real.thread_count,
    post_count:       doc.cache.real.post_count,
    display_order:    doc.display_order,
    last_thread: {
      forum_id:       doc.id,
      title:          doc.cache.real.last_thread_title,
      id:             doc.cache.real.last_thread_id,
      post_id:        doc.cache.real.last_post_id,
      user:           doc.cache.real.last_user,
      ts:             doc.cache.real.last_ts
    }
  };
}


// build three from sections list
var build_tree = module.exports.build_tree = function(source, root, deep, node_callback) {
  var result = [];
  var node;
  var node_parent;
  var id;

  if (!_.isArray(source)) {
    source = _.values(source);
  }
  if (!_.isFunction(node_callback)) {
    node_callback = function(a){return a;};
  }
  root = !!root ? root.toString() : null;

  for (var key=0; key < source.length; key++) {
    node = source[key];
    if (node !== undefined) {
      node_parent = !!node.parent ? node.parent.toString() : null;
      if (node_parent === root) {
        id = node._id.toString();

        node = node_callback(node);

        if (deep === null || deep > 0) {
          node.child_list = build_tree(source, id, deep-1, node_callback);
        }

        result.push(node);
        delete(source[key]);
      }
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
