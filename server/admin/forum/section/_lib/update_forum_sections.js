// Recompute parent-dependent fields on each section in the database:
// - `parent_list`
// - `parent_id_list`
// - `level`


'use strict';


var _     = require('lodash');
var async = require('async');


module.exports = function updateForumSections(N, callback) {
  N.models.forum.Section.find({}, function (err, sections) {
    if (err) {
      callback(err);
      return;
    }

    var sectionsById = {};

    // Remap sections list.
    _.forEach(sections, function (section) {
      sectionsById[section._id] = section;
    });

    // Recursively collect `parent_list`.
    function collectParentList(id) {
      var result;

      if (id) {
        result = collectParentList(sectionsById[id].parent);
        result.push(id);
      } else {
        result = [];
      }

      return result;
    }

    // Update parent-dependent fields.
    _.forEach(sections, function (section) {
      section.parent_list = collectParentList(section.parent);

      section.parent_id_list = _.map(section.parent_list, function (id) {
        return sectionsById[id].id;
      });

      section.level = section.parent_list.length;
    });

    // Save changed sections.
    async.forEach(sections, function (section, next) {
      if (section.isModified()) {
        section.save(next);
      } else {
        next();
      }
    }, callback);
  });
};
