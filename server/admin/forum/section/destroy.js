// Remove section from the database.


'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    _id: { format: 'mongo', required: true }
  });

  N.wire.on(apiPath, function section_destroy(env, callback) {
    N.models.forum.Section.findById(env.params._id, function (err, section) {
      if (err) {
        callback(err);
        return;
      }

      // If section is already deleted or not exists - OK.
      if (!section) {
        callback();
        return;
      }

      // Count children of ection to destroy.
      N.models.forum.Section.count({ parent: section._id }, function (err, childrenCount) {
        if (err) {
          callback(err);
          return;
        }

        // Fail if there are any child sections.
        if (childrenCount !== 0) {
          callback({ code: N.io.CLIENT_ERROR, message: env.t('error_section_has_children') });
          return;
        }

        // Count user posts of section to destroy.
        N.models.forum.Post.count({ section: section._id }, function (err, postsCount) {
          if (err) {
            callback(err);
            return;
          }

          // Fail if some sections contain user posts.
          if (postsCount !== 0) {
            callback({ code: N.io.CLIENT_ERROR, message: env.t('error_section_contains_posts') });
            return;
          }

          // All ok. Destroy section.
          section.remove(callback);
        });
      });
    });
  });
};
