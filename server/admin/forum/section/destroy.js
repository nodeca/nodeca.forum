// Remove section from the database.


'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    _id: { format: 'mongo', required: true }
  });

  N.wire.on(apiPath, async function section_destroy(env) {
    let section = await N.models.forum.Section.findById(env.params._id);

    // If section is already deleted or not exists - OK.
    if (!section) return;

    // Fail if there are any child sections.
    let anyChild = await N.models.forum.Section.findOne({ parent: section._id });

    if (anyChild) {
      throw { code: N.io.CLIENT_ERROR, message: env.t('error_section_has_children') };
    }

    // Fail if this section contains user posts.
    let anyPost = await N.models.forum.Post.findOne({ section: section._id });

    if (anyPost) {
      throw { code: N.io.CLIENT_ERROR, message: env.t('error_section_contains_posts') };
    }

    // All ok. Destroy section.
    await section.remove();
  });
};
