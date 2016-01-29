// Remove section from the database.


'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    _id: { format: 'mongo', required: true }
  });

  N.wire.on(apiPath, function* section_destroy(env) {
    let section = yield N.models.forum.Section.findById(env.params._id);

    // If section is already deleted or not exists - OK.
    if (!section) return;

    // Count children of ection to destroy.
    let childrenCount = yield N.models.forum.Section.count({ parent: section._id });

    // Fail if there are any child sections.
    if (childrenCount !== 0) {
      throw { code: N.io.CLIENT_ERROR, message: env.t('error_section_has_children') };
    }

    // Count user posts of section to destroy.
    let postsCount = yield N.models.forum.Post.count({ section: section._id });

    // Fail if some sections contain user posts.
    if (postsCount !== 0) {
      throw { code: N.io.CLIENT_ERROR, message: env.t('error_section_contains_posts') };
    }

    // All ok. Destroy section.
    yield section.remove();
  });
};
