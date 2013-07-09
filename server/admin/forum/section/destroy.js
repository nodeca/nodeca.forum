// Remove section and all it's descendants from the database.


'use strict';


var _        = require('lodash');
var async    = require('async');
var mongoose = require('mongoose');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    _id: { type: 'string', required: true }
  });

  N.wire.on(apiPath, function section_destroy(env, callback) {
    var _id = mongoose.Types.ObjectId(env.params._id);

    // Select section and all it's descendants.
    N.models.forum.Section
        .find({ $or: [ { _id: _id }, { parent_list: _id } ]})
        .exec(function (err, sections) {

      if (err) {
        callback(err);
        return;
      }

      // If section is already deleted or not exists - OK.
      if (_.isEmpty(sections)) {
        callback();
        return;
      }

      // Count user posts in any of find sections.
      N.models.forum.Post.count({ forum: { $in: _.pluck(sections, '_id') } }, function (err, postsCount) {
        if (err) {
          callback(err);
          return;
        }

        // Fail if some sections contain user posts.
        if (0 !== postsCount) {
          callback({ code: N.io.CLIENT_ERROR, message: env.t('error_section_contains_posts') });
          return;
        }

        // All ok. Destroy section and it's descendants.
        async.forEach(sections, function (section, next) {
          section.remove(next);
        }, callback);
      });
    });
  });
};
