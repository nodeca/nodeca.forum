// Update a set of basic fields on section.


'use strict';


var _     = require('lodash');
var async = require('async');

var updateForumSections = require('./_lib/update_forum_sections');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    _id:            { type: 'string',           required: true  }
  , parent:         { type: ['null', 'string'], required: false }
  , display_order:  { type: 'number',           required: false }
  , title:          { type: 'string',           required: false }
  , description:    { type: 'string',           required: false }
  , is_category:    { type: 'boolean',          required: false }
  , is_enabled:     { type: 'boolean',          required: false }
  , is_writeble:    { type: 'boolean',          required: false }
  , is_searcheable: { type: 'boolean',          required: false }
  , is_voteable:    { type: 'boolean',          required: false }
  , is_counted:     { type: 'boolean',          required: false }
  , is_excludable:  { type: 'boolean',          required: false }
  });

  N.wire.on(apiPath, function section_update(env, callback) {
    N.models.forum.Section.findById(env.params._id, function (err, updateSection) {
      if (err) {
        callback(err);
        return;
      }

      _.forEach([
        'parent'
      , 'display_order'
      , 'title'
      , 'description'
      , 'is_category'
      , 'is_enabled'
      , 'is_writeble'
      , 'is_searcheable'
      , 'is_voteable'
      , 'is_counted'
      , 'is_excludable'
      ], function (field) {
        if (_.has(env.params, field)) {
          updateSection.set(field, env.params[field]);
        }
      });

      var isParentChanged = updateSection.isModified('parent');

      async.series([
        //
        // If section's `parent` is changed, but new `display_order` is not
        // specified, find free `display_order`.
        //
        function (next) {
          if (!isParentChanged || _.has(env.params, 'display_order')) {
            next();
            return;
          }

          // This is the most simple way to find max value of a field in Mongo.
          N.models.forum.Section
              .find({ parent: updateSection.parent })
              .select('display_order')
              .sort('-display_order')
              .limit(1)
              .setOptions({ lean: true })
              .exec(function (err, result) {

            if (err) {
              next(err);
              return;
            }

            updateSection.display_order = _.isEmpty(result) ? 1 : result[0].display_order + 1;
            next();
          });
        }
        //
        // Save changes at updateSection.
        //
      , function (next) {
          updateSection.save(next);
        }
        //
        // Recompute parent-dependent fields for all sections.
        //
      , async.apply(updateForumSections, N)
      ], callback);
    });
  });
};
