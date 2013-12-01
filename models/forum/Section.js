'use strict';


var Mongoose = require('mongoose');
var Schema   = Mongoose.Schema;
var async    = require('async');
var memoizee = require('memoizee');


module.exports = function (N, collectionName) {

  var cache = {
    topic_count      : { type: Number, 'default': 0 }
  , post_count       : { type: Number, 'default': 0 }

  , last_post        : Schema.ObjectId
  , last_topic       : Schema.ObjectId
  , last_topic_hid   : Number
  , last_topic_title : String
  , last_user        : Schema.ObjectId
  , last_ts          : Date
  };

  var Section = new Schema({
    title           : { type: String, required: true }
  , description     : String
  , display_order   : Number

    // user-friendly id (autoincremented)
  , hid              : { type: Number, min: 1, index: true }

    // Sections tree paths/cache
  , parent          : Schema.ObjectId

    // Visible moderator list.
  , moderators    : [Schema.ObjectId]

    // Options
  , is_category     : { type: Boolean, 'default': false } // subsection or category
  , is_enabled      : { type: Boolean, 'default': true }  // hiden inactive
  , is_writeble     : { type: Boolean, 'default': true} // read-only archive
  , is_searcheable  : { type: Boolean, 'default': true }
  , is_voteable     : { type: Boolean, 'default': true }
  , is_counted      : { type: Boolean, 'default': true }  // inc user's counter, when posted here
  , is_excludable   : { type: Boolean, 'default': true}

    // Topic prefixes
  , is_prefix_required  : { type: Boolean, 'default': false }
  , prefix_groups   : [Schema.ObjectId] // allowed groups of prefixes

    // Cache
  , cache           : cache
  , cache_hb        : cache

    // Setting storage. Only `section_usergroup` settings store should access this.
  , settings        : { type: Schema.Types.Mixed, 'default': {} }
  },
  {
    versionKey : false
  });


  // Indexes
  ////////////////////////////////////////////////////////////////////////////////

  // build section tree structure in `getSectionsTree` (see below)
  Section.index({
    display_order: 1
  , _id: -1
  });


  // Hooks
  ////////////////////////////////////////////////////////////////////////////////

  // Compute `parent_list` and `level` fields before save.
  //
  Section.pre('save', function (next) {
    var self = this;

    // Record modified state of `parent` field for post hook.
    // Always assume true for unsaved models.
    self.__isParentModified__ = self.isModified('parent') || self.isNew;

    next();
  });

  // Set 'hid' for the new section.
  // This hook should always be the last one to avoid counter increment on error
  Section.pre('save', function (callback) {
    if (!this.isNew) {
      callback();
      return;
    }

    var self = this;
    N.models.core.Increment.next('section', function(err, value) {
      if (err) {
        callback(err);
        return;
      }

      self.hid = value;
      callback();
    });
  });

  // Update all inherited settings (permissions) for subsections.
  //
  Section.post('save', function (section) {

    // Nothing to do if parent is not changed.
    if (!section.__isParentModified__) {
      return;
    }

    async.series([

      function (next) {
        var SectionUsergroupStore = N.settings.getStore('section_usergroup');

        if (!SectionUsergroupStore) {
          N.logger.error('Settings store `section_usergroup` is not registered.');
          next();
          return;
        }

        SectionUsergroupStore.updateInherited(section._id, function (err) {
          if (err) {
            N.logger.error('%s', err);
          }
          next();
        });
      }
    , function (next) {
        var SectionModeratorStore = N.settings.getStore('section_moderator');

        if (!SectionModeratorStore) {
          N.logger.error('Settings store `section_moderator` is not registered.');
          next();
          return;
        }

        SectionModeratorStore.updateInherited(section._id, function (err) {
          if (err) {
            N.logger.error('%s', err);
          }
          next();
        });
      }
    ]);
  });

  // Hide hellbanned info for regular users for security reasons.
  // This method works with raw object.
  //
  // options:
  //
  // - `keep_data` - when true, use cache_hb instead of cache. Default - false.
  //
  Section.statics.sanitize = function sanitize(section, options) {
    options = options || {};

    // Use hellbanned last topic/post info for hellbanned current user or administrators
    if (section.cache_hb) {
      if (options.keep_data) {
        section.cache = section.cache_hb;
      }
      delete section.cache_hb;
    }
  };

  N.wire.on('init:models', function emit_init_Section(__, callback) {
    N.wire.emit('init:models.' + collectionName, Section, callback);
  });

  N.wire.on('init:models.' + collectionName, function init_model_Section(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });


  // Get sections tree, returns hash of nested trees for sections. Structure:
  //
  // _id:
  //   - _id - section `_id`
  //   - parent - link to parent section object
  //   - children[ { _id, parent, children[...] } ]
  //
  var getSectionsTree = memoizee(

    function(callback) {

      var result = {};

      N.models.forum.Section.find()
        .setOptions({ lean: true })
        .sort('display_order')
        .select('_id parent')
        .setOptions({ lean: true })
        .exec(function (err, sections) {

        if (err) {
          callback(err);
          return;
        }

        // create hash of trees for each section
        sections.forEach(function(section) {

          // check if section was already added by child. If not found, create it
          result[section._id] = result[section._id] || { _id: section._id, children: [] };

          // if section has parent, try to find it and push section to its children.
          // If parent not found, create it.
          if (section.parent) {
            // find parent in hash table
            if (result[section.parent]) {
              result[section.parent].children.push(result[section._id]);
            } else {
              // no parent in hash table, create and add it
              result[section.parent] = { _id: section.parent, children: [result[section._id]] };
            }
            // set link from section to parent
            result[section._id].parent = result[section.parent];
          }
        });

        // root is a special fake `section` that contains array of the root-level sections
        result.root = { children: [] };
        // fill root chirden
        sections.forEach(function(section) {
          if (!section.parent) {
            result.root.children.push(result[section._id]);
          }
        });

        callback(err, result);
      });
    },
    {
      async: true,
      maxAge:     60000, // cache TTL = 60 seconds
      primitive:  true   // params keys are calculated as toString, ok for our case
    }
  );

  // Returns list of parent _id-s for given section `_id`
  //
  Section.statics.getParentList = function(sectionID, callback) {

    getSectionsTree(function(err, sections) {

      if (err) {
        callback(err);
        return;
      }

      var parentList = [];
      var current = sections[sectionID].parent;

      while (current) {
        parentList.unshift(current._id);
        current = current.parent;
      }

      callback(null, parentList);
    });
  };


  // Returns list of child sections, including subsections until the given deepness.
  // Also, sets `level` property for found sections
  //
  // - getChildren((section, deepness, callback)
  // - getChildren(deepness, callback) - for root (on index page)
  // - getChildren(callback) - for all
  //
  // result:
  //
  // - [ {_id, level} ]
  //
  Section.statics.getChildren = function(sectionID, deepness, callback) {

    // shift parameters
    if (deepness === undefined) {
      // single parameter is callback
      callback = sectionID;
      deepness = -1;
      sectionID = null;
    } else if (callback === null) {
      // two parameters are deepness and callback
      callback = deepness;
      deepness = sectionID;
      sectionID = null;
    }

    var children = [];

    function fillChildren(section, curDeepness, maxDeepness) {

      if (maxDeepness >= 0 && curDeepness >= maxDeepness) {
        return;
      }

      section.children.forEach(function (childSection) {
        children.push({ _id: childSection._id, level: curDeepness });
        fillChildren(childSection, curDeepness + 1, maxDeepness);
      });
    }

    getSectionsTree(function(err, sections) {
      if (err) {
        callback(err);
        return;
      }

      var storedSection = sections[sectionID || 'root'];
      fillChildren(storedSection, 0, deepness);
      callback(null, children);
    });
  };

};
