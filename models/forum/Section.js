'use strict';


var Mongoose = require('mongoose');
var Schema   = Mongoose.Schema;
var async    = require('async');


module.exports = function (N, collectionName) {

  var cache = {
    real: {
      thread_count      : { type: Number, 'default': 0 }
    , post_count        : { type: Number, 'default': 0 }

    , last_post         : Schema.ObjectId
    , last_post_id      : Number
    , last_thread       : Schema.ObjectId
    , last_thread_id    : Number
    , last_thread_title : String
    , last_user         : Schema.ObjectId
    , last_ts           : Date
    }
  , hb: {
      thread_count      : { type: Number, 'default': 0 }
    , post_count        : { type: Number, 'default': 0 }

    , last_post         : Schema.ObjectId
    , last_post_id      : Number
    , last_thread       : Schema.ObjectId
    , last_thread_id    : Number
    , last_thread_title : String
    , last_user         : Schema.ObjectId
    , last_ts           : Date
    }
  };

  var Section = new Schema({
    title           : { type: String, required: true }
  , description     : String
  , display_order   : Number

    // user-friendly id (autoincremented)
  , id              : { type: Number, required: true, min: 1, index: true }

    // Sections tree paths/cache
  , parent          : Schema.ObjectId
  , parent_id       : Number
  , parent_list     : [Schema.ObjectId]
  , parent_id_list  : [Number]

  , level           : { type: Number, 'default': 0 }

    // Visible moderator lists.
  , moderator_id_list : [Number]
  , moderator_list    : [Schema.ObjectId]

    // Options
  , is_category     : { type: Boolean, 'default': false } // subforum or category
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

    // Setting storage. Only `forum_usergroup` settings store should access this.
  , settings        : { type: Schema.Types.Mixed, 'default': {} }
  });


  // Indexes
  ////////////////////////////////////////////////////////////////////////////////

  // build tree on index page
  Section.index({
    level: 1
  , display_order: 1
  , _id: -1
  });

  // build tree in forum page
  Section.index({
    level: 1
  , parent_list: 1
  , display_order: 1
  , _id: -1
  });


  // Hooks
  ////////////////////////////////////////////////////////////////////////////////

  // Compute `parent_list`, `parent_id`, `parent_id_list`, and `level` fields before save.
  //
  Section.pre('save', function (next) {
    var self = this;

    // Record modified state of `parent` field for post hook.
    self.__isParentModified__ = self.isModified('parent');

    // Nothing to do if parent is not changed.
    if (!self.__isParentModified__) {
      next();
      return;
    }

    if (!self.parent) {
      self.parent_list    = [];
      self.parent_id      = null;
      self.parent_id_list = [];
      self.level          = 0;
      next();
      return;
    }

    N.models.forum.Section
        .findById(self.parent)
        .select('_id id parent_list parent_id_list level')
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
      self.parent_id      = parentSection.id;
      self.parent_id_list = parentSection.parent_id_list.concat(parentSection.id);
      self.level          = parentSection.level + 1;
      next();
    });
  });

  // Recompute and save parent-dependent data on forum sections:
  // - Fields `parent_list`, `parent_id_list`, and `level`.
  // - Section-specified settings inheritance.
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
          section.parent_id      = parentSection.id;
          section.parent_id_list = parentSection.parent_id_list.concat(parentSection.id);
          section.level          = parentSection.level + 1;

          section.save(function (err) {
            if (err) {
              next(err);
              return;
            }
            updateDescendants(section, next);
          });
        }, callback);
      });
    }

    updateDescendants(section, function (err) {
      if (err) {
        N.logger.error('%s', err);
        return;
      }

      var ForumUsergroupStore = N.settings.getStore('forum_usergroup');

      if (!ForumUsergroupStore) {
        N.logger.error('Settings store `forum_usergroup` is not registered.');
        return;
      }

      ForumUsergroupStore.updateInherited(section._id, function (err) {
        if (err) {
          N.logger.error('%s', err);
        }
      });
    });
  });


  N.wire.on("init:models", function emit_init_Section(__, callback) {
    N.wire.emit("init:models." + collectionName, Section, callback);
  });

  N.wire.on("init:models." + collectionName, function init_model_Section(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
