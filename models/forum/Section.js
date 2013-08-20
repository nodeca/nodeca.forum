'use strict';


var Mongoose = require('mongoose');
var Schema   = Mongoose.Schema;
var async    = require('async');


module.exports = function (N, collectionName) {

  var cache = {
    real: {
      topic_count      : { type: Number, 'default': 0 }
    , post_count       : { type: Number, 'default': 0 }

    , last_post        : Schema.ObjectId
    , last_topic       : Schema.ObjectId
    , last_topic_hid   : Number
    , last_topic_title : String
    , last_user        : Schema.ObjectId
    , last_ts          : Date
    }
  , hb: {
      topic_count      : { type: Number, 'default': 0 }
    , post_count       : { type: Number, 'default': 0 }

    , last_post        : Schema.ObjectId
    , last_topic       : Schema.ObjectId
    , last_topic_hid   : Number
    , last_topic_title : String
    , last_user        : Schema.ObjectId
    , last_ts          : Date
    }
  };

  var Section = new Schema({
    title           : { type: String, required: true }
  , description     : String
  , display_order   : Number

    // user-friendly id (autoincremented)
  , hid              : { type: Number, min: 1, index: true }

    // Sections tree paths/cache
  , parent          : Schema.ObjectId
  , parent_list     : [Schema.ObjectId]

  , level           : { type: Number, 'default': 0 }

    // Visible moderator lists.
  , moderator_id_list : [Number]
  , moderator_list    : [Schema.ObjectId]

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

    // Setting storage. Only `section_usergroup` settings store should access this.
  , settings        : { type: Schema.Types.Mixed, 'default': {} }
  },
  {
    versionKey : false
  });


  // Indexes
  ////////////////////////////////////////////////////////////////////////////////

  // build tree on index page
  Section.index({
    level: 1
  , display_order: 1
  , _id: -1
  });

  // build tree in section page
  Section.index({
    level: 1
  , parent_list: 1
  , display_order: 1
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

    // Nothing to do if parent is not changed.
    if (!self.__isParentModified__) {
      next();
      return;
    }

    if (!self.parent) {
      self.parent_list    = [];
      self.level          = 0;
      next();
      return;
    }

    N.models.forum.Section
        .findById(self.parent)
        .select('_id hid parent_list level')
        .exec(function (err, parentSection) {

      if (err) {
        next(err);
        return;
      }

      if (!parentSection) {
        next('Cannot save forum section ' + self._id + ': `parent` field references a non-existent section.');
        return;
      }

      self.parent_list    = parentSection.parent_list.concat(parentSection._id);
      self.level          = parentSection.level + 1;
      next();
    });
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

  // Update all subsection's data for saved section: `parent_list` and `level`.
  // Update all inherited settings (permissions) for subsections.
  //
  Section.post('save', function (section) {

    // Nothing to do if parent is not changed.
    if (!section.__isParentModified__) {
      return;
    }

    function updateDescendants(parentSection, callback) {
      N.models.forum.Section.find({ parent: parentSection._id }, function (err, sections) {
        if (err) {
          callback(err);
          return;
        }

        async.forEach(sections, function (section, next) {
          section.parent_list    = parentSection.parent_list.concat(parentSection._id);
          section.level          = parentSection.level + 1;

          section.save(function (err) {
            if (err) {
              N.logger.error('%s', err);
              next();
              return;
            }
            updateDescendants(section, next);
          });
        }, callback);
      });
    }

    async.series([
      function (next) {
        updateDescendants(section, function (err) {
          if (err) {
            N.logger.error('%s', err);
          }
          next();
        });
      }
    , function (next) {
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


  N.wire.on("init:models", function emit_init_Section(__, callback) {
    N.wire.emit("init:models." + collectionName, Section, callback);
  });

  N.wire.on("init:models." + collectionName, function init_model_Section(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
