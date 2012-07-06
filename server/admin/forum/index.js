"use strict";

/*global nodeca, _*/

var build_tree = require('../../../lib/helpers/forum.js').build_tree;

var Section = nodeca.models.forum.Section;

module.exports = function (params, next) {

  var sections = _.values(nodeca.cache.get('sections', []));

  this.response.data.sections = build_tree(sections, null, null, function(section) {
    var doc = section._doc;
    doc._id = doc._id.toString();
    if (doc.parent) {
      doc.parent = doc.parent.toString();
    }
    else {
      doc.parent = null;
    }
    // ToDo replace counters for hb users
    return {
      _id:              doc._id,
      id:               doc.id,
      title:            doc.title,
      description:      doc.description,
      parent:           doc.parent,
    };
  });
  next();
};

