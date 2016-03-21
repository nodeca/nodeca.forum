// Create new section.


'use strict';


const _     = require('lodash');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    parent:         { type: [ 'null', 'string' ], required: true },
    title:          { type: 'string',           required: true, minLength: 1 },
    description:    { type: 'string',           required: true },
    is_category:    { type: 'boolean',          required: true },
    is_enabled:     { type: 'boolean',          required: true },
    is_writable:    { type: 'boolean',          required: true },
    is_searchable:  { type: 'boolean',          required: true },
    is_votable:     { type: 'boolean',          required: true },
    is_counted:     { type: 'boolean',          required: true },
    is_excludable:  { type: 'boolean',          required: true }
  });

  N.wire.on(apiPath, function* section_create(env) {
    let SectionUsergroupStore = N.settings.getStore('section_usergroup');

    if (!SectionUsergroupStore) {
      throw { code: N.io.APP_ERROR, message: 'Settings store `section_usergroup` is not registered.' };
    }

    let newSection = new N.models.forum.Section(env.params);


    // Ensure parent section exists. (if provided)
    if (newSection.parent) {

      let parentSection = yield N.models.forum.Section
                                    .findById(newSection.parent)
                                    .select('_id')
                                    .lean(true);

      if (!parentSection) {
        throw { code: N.io.CLIENT_ERROR, message: env.t('error_parent_not_exists') };
      }
    }


    // Find and set free `hid` value for new section. (not `_id`!)

    // This is the most simple way to find max value of a field in Mongo.
    let result = yield N.models.forum.Section
                          .find()
                          .select('hid')
                          .sort('-hid')
                          .limit(1)
                          .lean(true);

    newSection.hid = _.isEmpty(result) ? 1 : result[0].hid + 1;

    // Find and set free `display_order` value in the end of siblings list.
    result = yield N.models.forum.Section
                      .find({ parent: newSection.parent })
                      .select('display_order')
                      .sort('-display_order')
                      .limit(1)
                      .lean(true);

    newSection.display_order = _.isEmpty(result) ? 1 : result[0].display_order + 1;

    // Save new section into the database.
    yield newSection.save();
  });
};
