// Create new section.


'use strict';


var _     = require('lodash');
var async = require('async');


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    parent:         { type: [ 'null', 'string' ], required: true },
    title:          { type: 'string',           required: true, minLength: 1 },
    description:    { type: 'string',           required: true },
    is_category:    { type: 'boolean',          required: true },
    is_enabled:     { type: 'boolean',          required: true },
    is_writeble:    { type: 'boolean',          required: true },
    is_searcheable: { type: 'boolean',          required: true },
    is_voteable:    { type: 'boolean',          required: true },
    is_counted:     { type: 'boolean',          required: true },
    is_excludable:  { type: 'boolean',          required: true }
  });

  N.wire.on(apiPath, function section_create(env, callback) {
    var SectionUsergroupStore = N.settings.getStore('section_usergroup');

    if (!SectionUsergroupStore) {
      callback({ code: N.io.APP_ERROR, message: 'Settings store `section_usergroup` is not registered.' });
      return;
    }

    var newSection = new N.models.forum.Section(env.params);

    async.series([
      //
      // Ensure parent section exists. (if provided)
      //
      function (next) {
        if (!newSection.parent) {
          next();
          return;
        }

        N.models.forum.Section
            .findById(newSection.parent)
            .select('_id')
            .lean(true)
            .exec(function (err, parentSection) {

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
      },
      //
      // Find and set free `hid` value for new section. (not `_id`!)
      //
      function (next) {
        // This is the most simple way to find max value of a field in Mongo.
        N.models.forum.Section
            .find()
            .select('hid')
            .sort('-hid')
            .limit(1)
            .lean(true)
            .exec(function (err, result) {

          if (err) {
            next(err);
            return;
          }

          newSection.hid = _.isEmpty(result) ? 1 : result[0].hid + 1;
          next();
        });
      },
      //
      // Find and set free `display_order` value in the end of siblings list.
      //
      function (next) {
        // This is the most simple way to find max value of a field in Mongo.
        N.models.forum.Section
            .find({ parent: newSection.parent })
            .select('display_order')
            .sort('-display_order')
            .limit(1)
            .lean(true)
            .exec(function (err, result) {

          if (err) {
            next(err);
            return;
          }

          newSection.display_order = _.isEmpty(result) ? 1 : result[0].display_order + 1;
          next();
        });
      },
      //
      // Save new section into the database.
      //
      function (next) {
        newSection.save(next);
      }
    ], callback);
  });
};
