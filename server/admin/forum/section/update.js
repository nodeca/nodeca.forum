// Update a set of sections.


'use strict';


var _     = require('lodash');
var async = require('async');


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

  N.wire.on(apiPath, function (env, callback) {
    N.models.forum.Section.findById(env.params._id, function (err, section) {
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
          section[field] = env.params[field];
        }
      });

      section.save(function (err) {
        if (err) {
          callback(err);
          return;
        }

        N.models.forum.Section.find().exec(function (err, sections) {
          if (err) {
            callback(err);
            return;
          }

          var sectionsById = {};

          // Recursively collect `parent_list`.
          function collectParentList(id) {
            var result;

            if (id) {
              result = collectParentList(sectionsById[id].parent);
              result.push(id);
            } else {
              result = [];
            }

            return result;
          }

          _.forEach(sections, function (section) {
            sectionsById[section._id] = section;
          });

          _.forEach(sections, function (section) {
            section.parent_list = collectParentList(section.parent);
            section.parent_id_list = _.map(section.parent_list, function (id) {
              return sectionsById[id].id;
            });
          });

          async.forEach(sections, function (section, next) {
            if (section.isModified()) {
              section.save(next);
            } else {
              next();
            }
          }, callback);
        });
      });
    });
  });
};
