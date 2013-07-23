// Update a set of basic fields on section.
//
// NOTE: This method is used for both:
// - section/index page for section reordering.
// - section/edit page for changing certain section fields.


'use strict';


var _     = require('lodash');
var async = require('async');

var updateInheritedSectionData = require('nodeca.forum/lib/admin/update_inherited_section_data');


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
    var ForumUsergroupStore = N.settings.getStore('forum_usergroup');

    if (!ForumUsergroupStore) {
      callback({ code: N.io.APP_ERROR, message: 'Settings store `forum_usergroup` is not registered.' });
      return;
    }

    N.models.forum.Section.findById(env.params._id, function (err, section) {
      if (err) {
        callback(err);
        return;
      }

      // Update specified fields.
      _(env.params).keys().without('_id').forEach(function (key) {
        section.set(key, env.params[key]);
      });

      async.series([
        //
        // If section's `parent` is changed, but new `display_order` is not
        // specified, find free `display_order`.
        //
        // NOTE: Used when user changes `parent` field via edit page.
        //
        function (next) {
          if (!section.isModified('parent') || _.has(env.params, 'display_order')) {
            next();
            return;
          }

          // This is the most simple way to find max value of a field in Mongo.
          N.models.forum.Section
              .find({ parent: section.parent })
              .select('display_order')
              .sort('-display_order')
              .limit(1)
              .setOptions({ lean: true })
              .exec(function (err, result) {

            if (err) {
              next(err);
              return;
            }

            section.display_order = _.isEmpty(result) ? 1 : result[0].display_order + 1;
            next();
          });
        }
        //
        // Save changes at section.
        //
      , function (next) {
          section.save(next);
        }
        //
        // Recompute parent-dependent data for descendant sections.
        //
      , async.apply(updateInheritedSectionData, N)
      ], callback);
    });
  });
};
