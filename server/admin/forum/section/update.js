// Update a set of basic fields on section.


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
        function set_display_order(next) {
          if (!isParentChanged || _.has(env.params, 'display_order')) {
            next();
            return;
          }

          // Select section's new siblings to find free 'display_order' index.
          N.models.forum.Section
              .find({ parent: updateSection.parent })
              .select('display_order')
              .setOptions({ lean: true })
              .exec(function (err, sections) {

            if (err) {
              next(err);
              return;
            }

            if (_.isEmpty(sections)) {
              updateSection.display_order = 1;
            } else {
              updateSection.display_order = _.max(sections, 'display_order').display_order + 1;
            }
            next();
          });
        }
        //
        // Save changes at updateSection.
        //
      , function save_section(next) {
          updateSection.save(next);
        }
        //
        // Update all related sections. (descendants)
        //
      , function update_related_sections(next) {
          if (!isParentChanged) {
            next();
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

            // Remap sections list.
            _.forEach(sections, function (section) {
              sectionsById[section._id] = section;
            });

            // Update parent-dependent fields.
            _.forEach(sections, function (section) {
              section.parent_list = collectParentList(section.parent);
              section.parent_id_list = _.map(section.parent_list, function (id) {
                return sectionsById[id].id;
              });
              section.level = section.parent_list.length;
            });

            // Save changed sections.
            async.forEach(sections, function (section, next) {
              if (section.isModified()) {
                section.save(next);
              } else {
                next();
              }
            }, next);
          });
        }
      ], callback);
    });
  });
};
