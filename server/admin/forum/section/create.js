// Create new section.


'use strict';


var _     = require('lodash');
var async = require('async');


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

  N.wire.on(apiPath, function (env, callback) {
    var newSection = new N.models.forum.Section(env.params);

    async.series([
      //
      // In case that new section has a parent, we must compute values for
      // `parent_list`, `parent_id`, `parent_id_list`, and `level` fields.
      //
      function compute_parent_dependent_fields(next) {
        if (!newSection.parent) {
          next();
          return;
        }

        N.models.forum.Section.findById(newSection.parent, function (err, parentSection) {
          if (err) {
            next(err);
            return;
          }

          if (!parentSection) {
            next({ code: N.io.CLIENT_ERROR, message: env.t('error_parent_not_exists') });
            return;
          }

          newSection.parent_list    = parentSection.parent_list.concat(parentSection._id);
          newSection.parent_id      = parentSection.id;
          newSection.parent_id_list = parentSection.parent_id_list.concat(parentSection.id);
          newSection.level          = parentSection.level + 1;
          next();
        });
      }
      //
      // Find and set free `id` value for new section. (not `_id`!)
      //
    , function set_id(next) {
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
    , function set_display_order(next) {
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
    , function save_section(next) {
        newSection.save(next);
      }
    ], callback);
  });
};
