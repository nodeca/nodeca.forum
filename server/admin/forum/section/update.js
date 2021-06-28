// Update a set of basic fields on section.
//
// NOTE: This method is used for both:
// - section/index page for section reordering.
// - section/edit page for changing certain section fields.


'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    _id:            { format: 'mongo', required: true },
    parent:         { type: [ 'null', 'string' ], required: true },
    title:          { type: 'string',           required: true },
    description:    { type: 'string',           required: true },
    is_category:    { type: 'boolean',          required: true },
    is_enabled:     { type: 'boolean',          required: true },
    is_writable:    { type: 'boolean',          required: true },
    is_searchable:  { type: 'boolean',          required: true },
    is_votable:     { type: 'boolean',          required: true },
    is_counted:     { type: 'boolean',          required: true },
    is_excludable:  { type: 'boolean',          required: true }
  });

  N.wire.on(apiPath, async function section_update(env) {
    var SectionUsergroupStore = N.settings.getStore('section_usergroup');

    if (!SectionUsergroupStore) {
      throw { code: N.io.APP_ERROR, message: 'Settings store `section_usergroup` is not registered.' };
    }

    let section = await N.models.forum.Section.findById(env.params._id);

    env.data.section = section;

    // Update specified fields.
    Object.keys(env.params).forEach(key => {
      if (key !== '_id' && key !== 'parent') { section.set(key, env.params[key]); }
    });

    // Take extra care while updating 'parent' field:
    // it is stored as 'undefined' in the database, but it's 'null' in params
    if (String(section.parent || null) !== String(env.params.parent)) {
      section.set('parent', env.params.parent);
    }

    //
    // If section's `parent` is changed, find free `display_order`.
    //
    // NOTE: Used when user changes `parent` field via edit page.
    //
    if (section.isModified('parent')) {

      // This is the most simple way to find max value of a field in Mongo.
      let result = await N.models.forum.Section
                            .find({ parent: section.parent })
                            .select('display_order')
                            .sort('-display_order')
                            .limit(1)
                            .lean(true);

      section.display_order = result.length === 0 ? 1 : result[0].display_order + 1;
    }

    await section.save();
  });
};
