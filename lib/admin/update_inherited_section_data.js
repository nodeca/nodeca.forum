// Recompute and save parent-dependent data on all forum sections:
// - Fields `parent_list`, `parent_id_list`, and `level`.
// - Section-specified settings inheritance.


'use strict';


var _     = require('lodash');
var async = require('async');


module.exports = function updateInheritedSectionData(N, callback) {
  var ForumUsergroupStore = N.settings.getStore('forum_usergroup');

  if (!ForumUsergroupStore) {
    callback('Settings store `forum_usergroup` is not registered.');
    return;
  }

  async.series([
    //
    // Update `parent_list`, `parent_id_list`, and `level` fields.
    //
    function (next) {
      N.models.forum.Section.find({}, function (err, allSections) {
        if (err) {
          next(err);
          return;
        }

        // Recursively collect `parent_list`.
        //
        function collectParentList(sectionId) {
          if (!sectionId) {
            return [];
          }

          var section = _.find(allSections, function (section) {
            // Universal way for equal check on: Null, ObjectId, and String.
            return String(section._id) === String(sectionId);
          });

          if (!section) {
            N.logger.warn('Forum sections collection contains a reference to non-existent section %s', sectionId);
            return [];
          }

          if (!section.parent) {
            return [ section._id ];
          }

          return collectParentList(section.parent).concat(section._id);
        }

        // Map `parent_list` to `parent_id_list`.
        //
        function collectParentIdList(section) {
          return _.map(section.parent_list, function (sectionId) {
            var section = _.find(allSections, function (section) {
              // Universal way for equal check on: Null, ObjectId, and String.
              return String(section._id) === String(sectionId);
            });

            if (!section) {
              N.logger.warn('Forum sections collection contains a reference to non-existent section %s', sectionId);
              return -1;
            }

            return section.id;
          });
        }

        // Update parent-dependent fields.
        _.forEach(allSections, function (section) {
          section.parent_list    = collectParentList(section.parent);
          section.parent_id_list = collectParentIdList(section);
          section.level          = section.parent_list.length;
        });

        // Save changed sections.
        async.forEach(allSections, function (section, nextSection) {
          section.save(nextSection);
        }, next);
      });
    }
    //
    // Update inherited `forum_usergroup` settings.
    //
  , function (next) {
      ForumUsergroupStore.updateInherited(next);
    }
  ], callback);
};
