// Show edit form for a section.


'use strict';


var ACTIVE_SECTION_FIELDS = [
  '_id'
, 'title'
, 'description'
, 'parent'
, 'is_category'
, 'is_enabled'
, 'is_writeble'
, 'is_searcheable'
, 'is_voteable'
, 'is_counted'
, 'is_excludable'
].join(' ');


var OTHER_SECTION_FIELDS = [
  '_id'
, 'title'
, 'parent'
, 'level'
, 'display_order'
, 'is_category'
, 'is_enabled'
, 'is_writeble'
, 'is_searcheable'
, 'is_voteable'
, 'is_counted'
, 'is_excludable'
].join(' ');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    _id: { type: 'string', required: true }
  });

  N.wire.on(apiPath, function section_edit(env, callback) {
    N.models.forum.Section
        .findById(env.params._id)
        .select(ACTIVE_SECTION_FIELDS)
        .setOptions({ lean: true })
        .exec(function (err, activeSection) {

      if (err) {
        callback(err);
        return;
      }

      if (!activeSection) {
        callback(N.io.NOT_FOUND);
        return;
      }

      env.response.data.head.title = env.t('title', { name: activeSection.title });
      env.response.data.active_section = activeSection;

      N.models.forum.Section
          .find()
          .ne('_id', env.params._id)
          .select(OTHER_SECTION_FIELDS)
          .setOptions({ lean: true })
          .exec(function (err, otherSections) {

        if (err) {
          callback(err);
          return;
        }

        env.response.data.other_sections = otherSections;
        callback();
      });
    });
  });
};
