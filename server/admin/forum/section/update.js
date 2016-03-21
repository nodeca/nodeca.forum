// Update a set of basic fields on section.
//
// NOTE: This method is used for both:
// - section/index page for section reordering.
// - section/edit page for changing certain section fields.


'use strict';


var _ = require('lodash');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    _id:            { format: 'mongo', required: true },
    parent:         { type: [ 'null', 'string' ], required: false },
    display_order:  { type: 'number',           required: false },
    title:          { type: 'string',           required: false },
    description:    { type: 'string',           required: false },
    is_category:    { type: 'boolean',          required: false },
    is_enabled:     { type: 'boolean',          required: false },
    is_writable:    { type: 'boolean',          required: false },
    is_searchable:  { type: 'boolean',          required: false },
    is_votable:     { type: 'boolean',          required: false },
    is_counted:     { type: 'boolean',          required: false },
    is_excludable:  { type: 'boolean',          required: false }
  });

  N.wire.on(apiPath, function* section_update(env) {
    var SectionUsergroupStore = N.settings.getStore('section_usergroup');

    if (!SectionUsergroupStore) {
      throw { code: N.io.APP_ERROR, message: 'Settings store `section_usergroup` is not registered.' };
    }

    let section = yield N.models.forum.Section.findById(env.params._id);

    env.data.section = section;

    // Update specified fields.
    Object.keys(env.params).forEach(key => {
      if (key !== '_id') { section.set(key, env.params[key]); }
    });

    //
    // If section's `parent` is changed, but new `display_order` is not
    // specified, find free `display_order`.
    //
    // NOTE: Used when user changes `parent` field via edit page.
    //
    if (section.isModified('parent') || !_.has(env.params, 'display_order')) {

      // This is the most simple way to find max value of a field in Mongo.
      let result = yield N.models.forum.Section
                            .find({ parent: section.parent })
                            .select('display_order')
                            .sort('-display_order')
                            .limit(1)
                            .lean(true);

      section.display_order = _.isEmpty(result) ? 1 : result[0].display_order + 1;
    }

    yield section.save();
  });
};
