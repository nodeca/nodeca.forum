// Create new section.


'use strict';


var _     = require('lodash');
var async = require('async');

var updateForumSections    = require('./_lib/update_forum_sections');
var updateForumPermissions = require('../section_permissions/_lib/update_forum_permissions');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    parent:         { type: ['null', 'string'], required: true }
  , title:          { type: 'string',           required: true }
  , description:    { type: 'string',           required: true }
  , is_category:    { type: 'boolean',          required: true }
  , is_enabled:     { type: 'boolean',          required: true }
  , is_writeble:    { type: 'boolean',          required: true }
  , is_searcheable: { type: 'boolean',          required: true }
  , is_voteable:    { type: 'boolean',          required: true }
  , is_counted:     { type: 'boolean',          required: true }
  , is_excludable:  { type: 'boolean',          required: true }
  });

  N.wire.on(apiPath, function section_create(env, callback) {
    var newSection = new N.models.forum.Section(env.params);

    async.series([
      //
      // Ensure parent section exists. (if provided)
      //
      function (next) {
        if (!newSection.parent) {
          next(); // No parent - OK.
          return;
        }

        N.models.forum.Section.findById(newSection.parent, '_id', { lean: true }, function (err, parentSection) {
          if (err) {
            next(err);
            return;
          }

          if (!parentSection) {
            next({ code: N.io.CLIENT_ERROR, message: env.t('error_parent_not_exists') });
            return;
          }

          next();
        });
      }
      //
      // Find and set free `id` value for new section. (not `_id`!)
      //
    , function (next) {
        // This is the most simple way to find max value of a field in Mongo.
        N.models.forum.Section
            .find()
            .select('id')
            .sort('-id')
            .limit(1)
            .setOptions({ lean: true })
            .exec(function (err, result) {

          if (err) {
            next(err);
            return;
          }

          newSection.id = _.isEmpty(result) ? 1 : result[0].id + 1;
          next();
        });
      }
      //
      // Find and set free `display_order` value in the end of siblings list.
      //
    , function (next) {
        // This is the most simple way to find max value of a field in Mongo.
        N.models.forum.Section
            .find({ parent: newSection.parent })
            .select('display_order')
            .sort('-display_order')
            .limit(1)
            .setOptions({ lean: true })
            .exec(function (err, result) {

          if (err) {
            next(err);
            return;
          }

          newSection.display_order = _.isEmpty(result) ? 1 : result[0].display_order + 1;
          next();
        });
      }
      //
      // Save new section into the database.
      //
    , function (next) {
        newSection.save(next);
      }
      //
      // Setup parent-dependent data for newly created section.
      //
    , async.apply(updateForumSections, N)
    , async.apply(updateForumPermissions, N)
    ], callback);
  });
};
