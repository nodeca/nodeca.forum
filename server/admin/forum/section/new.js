// Show create form for new section.


'use strict';


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
  N.validate(apiPath, {});

  N.wire.on(apiPath, function (env, callback) {
    env.response.data.head.title = env.t('title');

    N.models.forum.Section.find({}, OTHER_SECTION_FIELDS, { lean: true }, function (err, otherSections) {
      if (err) {
        callback(err);
        return;
      }

      env.response.data.other_sections = otherSections;
      callback();
    });
  });
};
