'use strict';


var Mongoose = require('mongoose');
var Schema   = Mongoose.Schema;
var async    = require('async');
var memoizee = require('memoizee');


module.exports = function (N, collectionName) {

  var cache = {
    topic_count:      { type: Number, 'default': 0 },
    post_count:       { type: Number, 'default': 0 },

    last_post:        Schema.ObjectId,
    last_topic:       Schema.ObjectId,
    last_topic_hid:   Number,
    last_topic_title: String,
    last_user:        Schema.ObjectId,
    last_ts:          Date
  };

  var Section = new Schema({
    title:            String,
    description:      String,
    display_order:    Number,

    // user-friendly id (autoincremented)
    hid:              { type: Number, index: true },

    // Sections tree paths/cache
    parent:           Schema.ObjectId,

    // Visible moderator list.
    moderators:       [ Schema.ObjectId ],

    // Options
    is_category:      { type: Boolean, 'default': false }, // subsection or category
    is_enabled:       { type: Boolean, 'default': true },  // hiden inactive
    is_writeble:      { type: Boolean, 'default': true },  // read-only archive
    is_searcheable:   { type: Boolean, 'default': true },
    is_voteable:      { type: Boolean, 'default': true },
    is_counted:       { type: Boolean, 'default': true },  // inc user's counter, when posted here
    is_excludable:    { type: Boolean, 'default': true },

    // Topic prefixes
    is_prefix_required: { type: Boolean, 'default': false },
    prefix_groups:    [ Schema.ObjectId ], // allowed groups of prefixes

    // Cache
    cache:            cache,
    cache_hb:         cache,

    // Setting storage. Only `section_usergroup` settings store should access this.
    settings:         { type: Schema.Types.Mixed, 'default': {} }
  },
  {
    versionKey : false
  });


  // Indexes
  ////////////////////////////////////////////////////////////////////////////////

  // build section tree structure in `getSectionsTree` (see below)
  Section.index({
    display_order: 1,
    _id: -1
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
    N.models.core.Increment.next('section', function (err, value) {
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
      },
      function (next) {
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

    function (callback) {

      var result = {};

      N.models.forum.Section.find()
        .sort('display_order')
        .select('_id parent')
        .lean(true)
        .exec(function (err, sections) {

        if (err) {
          callback(err);
          return;
        }

        // create hash of trees for each section
        sections.forEach(function (section) {

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
              result[section.parent] = { _id: section.parent, children: [ result[section._id] ] };
            }
            // set link from section to parent
            result[section._id].parent = result[section.parent];
          }
        });

        // root is a special fake `section` that contains array of the root-level sections
        result.root = { children: [] };
        // fill root chirden
        sections.forEach(function (section) {
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
  Section.statics.getParentList = function (sectionID, callback) {

    getSectionsTree(function (err, sections) {

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
  Section.statics.getChildren = function (sectionID, deepness, callback) {

    // shift parameters
    if (typeof deepness === 'undefined') {
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

    getSectionsTree(function (err, sections) {
      if (err) {
        callback(err);
        return;
      }

      var storedSection = sections[sectionID || 'root'];
      fillChildren(storedSection, 0, deepness);
      callback(null, children);
    });
  };


  // Update cache: last_post, last_topic, last_user, last_ts
  //
  // - sectionID  - id of the section to update
  // - full       - update 'cache' even if last post is hellbanned
  //
  Section.statics.updateCache = function (sectionID, full, callback) {
    var Topic = N.models.forum.Topic;
    var updateData = {};

    var visible_st_hb = [
      Topic.statuses.OPEN,
      Topic.statuses.CLOSED,
      Topic.statuses.PINNED,
      Topic.statuses.HB
    ];

    N.models.forum.Topic
        .findOne({ section: sectionID, st: { $in: visible_st_hb } })
        .sort('-cache_hb.last_post')
        .exec(function (err, topic) {

      if (err) {
        callback(err);
        return;
      }

      if (!topic) {
        // all topics in this section are deleted
        callback();
        return;
      }

      // Last post in this section is considered hellbanned if
      //  (whole topic has HB status) OR (last post has HB status)
      //
      // Last post in the topic is hellbanned iff topic.cache differs from topic.cache_hb
      //
      var last_post_hb = (topic.st === Topic.statuses.HB) ||
                         (String(topic.cache.last_post) !== String(topic.cache_hb.last_post));

      if (!last_post_hb) {
        // If the last post in this section is not hellbanned, it is seen as
        // such for both hb and non-hb users. Thus, cache is the same for both.
        //
        updateData['cache.last_topic']       = topic._id;
        updateData['cache.last_topic_hid']   = topic.hid;
        updateData['cache.last_topic_title'] = topic.title;
        updateData['cache.last_post']        = topic.cache_hb.last_post;
        updateData['cache.last_user']        = topic.cache_hb.last_user;
        updateData['cache.last_ts']          = topic.cache_hb.last_ts;
      }

      updateData['cache_hb.last_topic']       = topic._id;
      updateData['cache_hb.last_topic_hid']   = topic.hid;
      updateData['cache_hb.last_topic_title'] = topic.title;
      updateData['cache_hb.last_post']        = topic.cache_hb.last_post;
      updateData['cache_hb.last_user']        = topic.cache_hb.last_user;
      updateData['cache_hb.last_ts']          = topic.cache_hb.last_ts;

      if (!full || last_post_hb) {
        N.models.forum.Section.update({ _id: sectionID }, updateData, callback);
        return;
      }

      var visible_st = [
        Topic.statuses.OPEN,
        Topic.statuses.CLOSED,
        Topic.statuses.PINNED
      ];


      N.models.forum.Topic
          .findOne({ section: sectionID, st: { $in: visible_st } })
          .sort('-cache.last_post')
          .exec(function (err, topic) {

        if (err) {
          callback(err);
          return;
        }

        if (!topic) {
          // all visible topics in this section are deleted
          callback();
          return;
        }

        updateData['cache.last_topic']       = topic._id;
        updateData['cache.last_topic_hid']   = topic.hid;
        updateData['cache.last_topic_title'] = topic.title;
        updateData['cache.last_post']        = topic.cache.last_post;
        updateData['cache.last_user']        = topic.cache.last_user;
        updateData['cache.last_ts']          = topic.cache.last_ts;

        N.models.forum.Section.update({ _id: sectionID }, updateData, callback);
      });
    });
  };
};
